import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import {
	createReadTool,
	truncateHead,
	formatSize,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import { readFile as fsReadFile } from "fs/promises";
import { normalizeToLF, stripBom, hasBareCarriageReturn } from "./edit-diff";
import { ensureHashInit, formatHashlineDisplay } from "./hashline";
import { buildPtcWarning, buildPtcLines, type PtcWarning } from "./ptc-value.js";
import { looksLikeBinary } from "./binary-detect";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";
import { getOrGenerateMap } from "./map-cache";
import { formatFileMapWithBudget } from "./readmap/formatter.js";
import { findSymbol, type SymbolMatch } from "./readmap/symbol-lookup.js";
import { buildReadOutput } from "./read-output.js";
import { Text } from "@mariozechner/pi-tui";
import { formatReadCallText, formatReadResultText } from "./read-render-helpers.js";

const READ_DESC = readFileSync(new URL("../prompts/read.md", import.meta.url), "utf-8")
	.replaceAll("{{DEFAULT_MAX_LINES}}", String(DEFAULT_MAX_LINES))
	.replaceAll("{{DEFAULT_MAX_BYTES}}", formatSize(DEFAULT_MAX_BYTES))
	.trim();

interface ReadParams {
	path: string;
	offset?: number;
	limit?: number;
	symbol?: string;
	map?: boolean;
}

export function registerReadTool(pi: ExtensionAPI) {
	const ptc = {
		callable: true,
		enabled: true,
		policy: "read-only" as const,
		readOnly: true,
		pythonName: "read",
		defaultExposure: "safe-by-default" as const,
	};

	const tool = {
		name: "read",
		label: "Read",
		description: READ_DESC,
		parameters: Type.Object({
			path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
			offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
			limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
			symbol: Type.Optional(Type.String({ description: "Symbol to read (e.g., functionName or ClassName.methodName)" })),
			map: Type.Optional(Type.Boolean({ description: "Append structural map to output (cannot combine with symbol)" })),
		}),
		ptc,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			await ensureHashInit();
			const p = params as ReadParams;
			const rawPath = p.path.replace(/^@/, "");
			const absolutePath = resolveToCwd(rawPath, ctx.cwd);

			throwIfAborted(signal);

			if (p.symbol && (p.offset !== undefined || p.limit !== undefined)) {
				return {
					content: [{ type: "text", text: "Cannot combine symbol with offset/limit. Use one or the other." }],
					isError: true,
					details: {},
				};
			}

			if (p.map && p.symbol) {
				return {
					content: [{ type: "text", text: "Cannot combine map with symbol. Use one or the other." }],
					isError: true,
					details: {},
				};
			}

			// Delegate images to the built-in read tool
			throwIfAborted(signal);
			const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";
			if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) {
				const builtinRead = createReadTool(ctx.cwd);
				return builtinRead.execute(_toolCallId, p, signal, _onUpdate);
			}

			throwIfAborted(signal);
			let rawBuffer: Buffer;
			try {
				rawBuffer = await fsReadFile(absolutePath);
			} catch (err: any) {
				const code = err?.code;
				if (code === "EISDIR") {
					return {
						content: [{ type: "text", text: `Path is a directory: ${rawPath}. Use ls to inspect directories.` }],
						isError: true,
						details: {},
					};
				}
				if (code === "EACCES" || code === "EPERM") {
					return {
						content: [{ type: "text", text: `Permission denied — cannot access: ${rawPath}` }],
						isError: true,
						details: {},
					};
				}
				if (code === "ENOENT") {
					return {
						content: [{ type: "text", text: `File not found: ${rawPath}` }],
						isError: true,
						details: {},
					};
				}
				return {
					content: [{ type: "text", text: `File not found: ${rawPath}` }],
					isError: true,
					details: {},
				};
			}
			const hasBinaryContent = looksLikeBinary(rawBuffer);
			throwIfAborted(signal);

			const normalized = normalizeToLF(stripBom(rawBuffer.toString("utf-8")).text);
			const allLines = normalized.split("\n");
			const total = allLines.length;
			const structuredWarnings: PtcWarning[] = [];

			let startLine = p.offset ? Math.max(1, p.offset) : 1;
			let endIdx = p.limit ? Math.min(startLine - 1 + p.limit, total) : total;
			if (p.offset && startLine > total) {
				return {
					content: [{ type: "text", text: `[offset ${p.offset} is past end of file (${total} lines)]` }],
					isError: true,
					details: {},
				};
			}
			let symbolMatch: SymbolMatch | undefined;
			let symbolWarning: string | undefined;
			if (p.symbol) {
				const fileMap = await getOrGenerateMap(absolutePath);
				if (!fileMap) {
					const extLabel = ext || "unknown";
					symbolWarning = `[Warning: symbol lookup not available for .${extLabel} files — showing full file]\n\n`;
				} else {
					const lookup = findSymbol(fileMap, p.symbol);
					if (lookup.type === "ambiguous") {
						const lines = lookup.candidates.map(
							(c) => `- ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}`,
						);
						const hints = lookup.candidates.map((c) => `${p.symbol}@${c.startLine}`).join(" or ");
						return {
							content: [
								{
									type: "text",
									text: [
										`Symbol '${p.symbol}' is ambiguous.`,
										"Matches:",
										...lines,
										`Use ${hints} to select by start line.`,
									].join("\n"),
								},
							],
							isError: false,
							details: {},
						};
					}
					if (lookup.type === "not-found") {
						const available = fileMap.symbols
							.slice(0, 20)
							.map((s) => s.name)
							.join(", ");
						symbolWarning = `[Warning: symbol '${p.symbol}' not found. Available symbols: ${available}]\n\n`;
					}
					if (lookup.type === "found") {
						startLine = Math.max(1, lookup.symbol.startLine);
						endIdx = Math.min(total, lookup.symbol.endLine);
						symbolMatch = lookup.symbol;
					}
				}
			}

			const selected = allLines.slice(startLine - 1, endIdx);
			const ptcLines = buildPtcLines(startLine, selected);

			const formatted = selected
				.map((line, i) => {
					const num = startLine + i;
					return formatHashlineDisplay(num, line);
				})
				.join("\n");

			const truncation = truncateHead(formatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
			let text = truncation.content;

			if (truncation.truncated) {
				text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${total} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${startLine + truncation.outputLines} to continue.]`;
			} else if (endIdx < total) {
				text += `\n\n[Showing lines ${startLine}-${endIdx} of ${total}. Use offset=${endIdx + 1} to continue.]`;
			}

			// Append structural map: on-demand (p.map) or auto on truncated full-file reads
			const shouldAppendMap =
				!!p.map ||
				(!!truncation.truncated && !p.offset && !p.limit && !symbolMatch);
			let appendedMap = false;
			let mapText: string | null = null;
			if (shouldAppendMap) {
				try {
					const fileMap = await getOrGenerateMap(absolutePath);
					if (fileMap) {
						const formattedMap = formatFileMapWithBudget(fileMap);
						text += "\n\n" + formattedMap;
						mapText = formattedMap;
						appendedMap = true;
					}
				} catch {
					// Map formatting failed — still return hashlined content without map
				}
			}

			if (p.symbol && symbolMatch) {
				const parentInfo = symbolMatch.parentName ? ` in ${symbolMatch.parentName}` : "";
				text = `[Symbol: ${symbolMatch.name} (${symbolMatch.kind})${parentInfo}, lines ${symbolMatch.startLine}-${symbolMatch.endLine} of ${total}]\n\n${text}`;
			}

			if (symbolWarning) {
				structuredWarnings.push(buildPtcWarning("symbol-warning", symbolWarning.trim()));
				text = symbolWarning + text;
			}

			if (hasBinaryContent) {
				const warning = "[Warning: file appears to be binary — output may be garbled]";
				structuredWarnings.push(buildPtcWarning("binary-content", warning));
				text = `${warning}\n\n${text}`;
			}

			if (hasBareCarriageReturn(rawBuffer.toString("utf-8"))) {
				const warning = "[Warning: file contains bare CR (\\r) line endings — line numbering may be inconsistent with grep and other tools]";
				structuredWarnings.push(buildPtcWarning("bare-cr", warning));
				text = `${warning}\n\n${text}`;
			}

const readOutput = buildReadOutput({
	path: absolutePath,
	startLine,
	endLine: endIdx,
	totalLines: total,
	selectedLines: selected,
	warnings: structuredWarnings,
	truncation: truncation.truncated
		? {
				outputLines: truncation.outputLines,
				totalLines: total,
				outputBytes: truncation.outputBytes,
				totalBytes: truncation.totalBytes,
			}
		: null,
	continuation: !truncation.truncated && endIdx < total ? { nextOffset: endIdx + 1 } : null,
	symbol: symbolMatch
		? {
				query: p.symbol ?? symbolMatch.name,
				name: symbolMatch.name,
				kind: symbolMatch.kind,
				parentName: symbolMatch.parentName,
				startLine: symbolMatch.startLine,
				endLine: symbolMatch.endLine,
			}
		: null,
	map: {
		requested: !!p.map,
		appended: appendedMap,
		text: mapText,
	},
});

return {
	content: [{ type: "text", text: readOutput.text }],
	details: {
		truncation: truncation.truncated ? truncation : undefined,
		ptcValue: readOutput.ptcValue,
	},
};
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const _context = rest[0];
			const { path: filePath, suffix } = formatReadCallText(args);

			let text = theme.fg("toolTitle", theme.bold("read"));
			if (filePath) {
				text += ` ${theme.fg("accent", filePath)}`;
			} else {
				text += ` ${theme.fg("toolOutput", "...")}`;
			}
			if (suffix) {
				text += ` ${theme.fg("dim", suffix)}`;
			}
			return new Text(text, 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string } =
				rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = context.expanded ?? (options as any)?.expanded ?? false;

			if (isPartial) return new Text(theme.fg("dim", "Reading\u2026"), 0, 0);

			const content = result.content?.[0];
			const textContent = content?.type === "text" ? content.text : "";

			if (isError || result.isError) {
				const firstLine = textContent.split("\n")[0] || "Error";
				if (expanded) {
					return new Text(theme.fg("error", textContent || firstLine), 0, 0);
				}
				return new Text(theme.fg("error", firstLine), 0, 0);
			}

			const ptcValue = (result.details as any)?.ptcValue as {
				tool: "read";
				range: { startLine: number; endLine: number; totalLines: number };
				warnings: Array<{ code: string; message: string }>;
				truncation: { outputLines: number; totalLines: number; outputBytes: number; totalBytes: number } | null;
				symbol: { query: string; name: string; kind: string; parentName?: string; startLine: number; endLine: number } | null;
				map: { requested: boolean; appended: boolean };
			} | undefined;

			if (!ptcValue) {
				const lines = textContent.split("\n").length;
				return new Text(theme.fg("success", `\u2713 ${lines} lines`), 0, 0);
			}

			const info = formatReadResultText({
				range: ptcValue.range,
				truncation: ptcValue.truncation,
				symbol: ptcValue.symbol,
				map: ptcValue.map,
				warnings: ptcValue.warnings,
			});

			const parts: string[] = [];

			if (info.symbolBadge) {
				parts.push(theme.fg("success", `\u2713 ${info.symbolBadge}`));
			}

			parts.push(theme.fg(info.truncated ? "warning" : "success", info.summary));

			for (const badge of info.badges) {
				if (badge.startsWith("\u26a0")) {
					parts.push(theme.fg("warning", badge));
				} else {
					parts.push(theme.fg("dim", badge));
				}
			}

			let text = parts.join("  ");

			if (expanded && textContent) {
				text += "\n" + textContent;
			}

			return new Text(text, 0, 0);
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

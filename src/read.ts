import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
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
import { computeLineHash, ensureHashInit } from "./hashline";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";
import { getOrGenerateMap } from "./map-cache";
import { formatFileMapWithBudget } from "./readmap/formatter.js";
import { findSymbol, type SymbolMatch } from "./readmap/symbol-lookup.js";

const READ_DESC = readFileSync(new URL("../prompts/read.md", import.meta.url), "utf-8")
	.replaceAll("{{DEFAULT_MAX_LINES}}", String(DEFAULT_MAX_LINES))
	.replaceAll("{{DEFAULT_MAX_BYTES}}", formatSize(DEFAULT_MAX_BYTES))
	.trim();

export function registerReadTool(pi: ExtensionAPI): void {
	pi.registerTool({
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

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			await ensureHashInit();
			const rawPath = params.path.replace(/^@/, "");
			const absolutePath = resolveToCwd(rawPath, ctx.cwd);

			throwIfAborted(signal);

			if (params.symbol && (params.offset !== undefined || params.limit !== undefined)) {
				return {
					content: [{ type: "text", text: "Cannot combine symbol with offset/limit. Use one or the other." }],
					isError: true,
					details: {},
				};
			}

			if (params.map && params.symbol) {
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
				return builtinRead.execute(_toolCallId, params, signal, _onUpdate);
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
			const hasBinaryContent = rawBuffer.includes(0);
			throwIfAborted(signal);

			const normalized = normalizeToLF(stripBom(rawBuffer.toString("utf-8")).text);
			const allLines = normalized.split("\n");
			const total = allLines.length;

			let startLine = params.offset ? Math.max(1, params.offset) : 1;
			let endIdx = params.limit ? Math.min(startLine - 1 + params.limit, total) : total;
			if (params.offset && startLine > total) {
				return {
					content: [{ type: "text", text: `[offset ${params.offset} is past end of file (${total} lines)]` }],
					isError: true,
					details: {},
				};
			}
			let symbolMatch: SymbolMatch | undefined;
			let symbolWarning: string | undefined;
			if (params.symbol) {
				const fileMap = await getOrGenerateMap(absolutePath);
				if (!fileMap) {
					const extLabel = ext || "unknown";
					symbolWarning = `[Warning: symbol lookup not available for .${extLabel} files — showing full file]\n\n`;
				} else {
					const lookup = findSymbol(fileMap, params.symbol);
					if (lookup.type === "ambiguous") {
						const lines = lookup.candidates.map(
							(c) => `- ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}`,
						);
						const hints = lookup.candidates.map((c) => `${params.symbol}@${c.startLine}`).join(" or ");
						return {
							content: [
								{
									type: "text",
									text: [
										`Symbol '${params.symbol}' is ambiguous.`,
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
						symbolWarning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${available}]\n\n`;
					}
					if (lookup.type === "found") {
						startLine = Math.max(1, lookup.symbol.startLine);
						endIdx = Math.min(total, lookup.symbol.endLine);
						symbolMatch = lookup.symbol;
					}
				}
			}

			const selected = allLines.slice(startLine - 1, endIdx);

			const formatted = selected
				.map((line, i) => {
					const num = startLine + i;
					return `${num}:${computeLineHash(num, line)}|${line}`;
				})
				.join("\n");

			const truncation = truncateHead(formatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
			let text = truncation.content;

			if (truncation.truncated) {
				text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${total} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${startLine + truncation.outputLines} to continue.]`;
			} else if (endIdx < total) {
				text += `\n\n[Showing lines ${startLine}-${endIdx} of ${total}. Use offset=${endIdx + 1} to continue.]`;
			}

			// Append structural map: on-demand (params.map) or auto on truncated full-file reads
			const shouldAppendMap =
				!!params.map ||
				(!!truncation.truncated && !params.offset && !params.limit && !symbolMatch);
			if (shouldAppendMap) {
				try {
					const fileMap = await getOrGenerateMap(absolutePath);
					if (fileMap) {
						const mapText = formatFileMapWithBudget(fileMap);
						text += "\n\n" + mapText;
					}
				} catch {
					// Map formatting failed — still return hashlined content without map
				}
			}

			if (params.symbol && symbolMatch) {
				const parentInfo = symbolMatch.parentName ? ` in ${symbolMatch.parentName}` : "";
				text = `[Symbol: ${symbolMatch.name} (${symbolMatch.kind})${parentInfo}, lines ${symbolMatch.startLine}-${symbolMatch.endLine} of ${total}]\n\n${text}`;
			}

			if (symbolWarning) {
				text = symbolWarning + text;
			}

			if (hasBinaryContent) {
				text = "[Warning: file appears to be binary — output may be garbled]\n\n" + text;
			}

			if (hasBareCarriageReturn(rawBuffer.toString("utf-8"))) {
				text =
					"[Warning: file contains bare CR (\\r) line endings — line numbering may be inconsistent with grep and other tools]\n\n" +
					text;
			}

			return {
				content: [{ type: "text", text }],
				details: { truncation: truncation.truncated ? truncation : undefined },
			};
		},
	});
}

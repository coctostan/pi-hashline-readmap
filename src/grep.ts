import type { ExtensionAPI, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile as fsReadFile, stat as fsStat } from "fs/promises";
import path from "path";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { normalizeToLF, stripBom, hasBareCarriageReturn } from "./edit-diff.js";
import { looksLikeBinary } from "./binary-detect.js";
import { ensureHashInit, formatHashlineDisplay, escapeControlCharsForDisplay } from "./hashline.js";
import { buildPtcError, buildPtcLine } from "./ptc-value.js";
import { buildGrepOutput } from "./grep-output.js";
import { buildGrepRehydrateDescriptor } from "./context-hygiene.js";
import { getOrGenerateMap } from "./map-cache.js";
import { scopeGrepGroupsToSymbols } from "./grep-symbol-scope.js";
import { resolveToCwd } from "./path-utils.js";
import { throwIfAborted } from "./runtime.js";
import { Text } from "@earendil-works/pi-tui";
import { formatGrepCallText, formatGrepResultText } from "./grep-render-helpers.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, linkToolPath, renderToolLabel, summaryLine } from "./tui-render-utils.js";

const GREP_PROMPT_METADATA = defineToolPromptMetadata({
	promptUrl: new URL("../prompts/grep.md", import.meta.url),
	promptSnippet: "Search file contents and return edit-ready hashline anchors",
	promptGuidelines: [
		"Use grep for text search across files instead of bash grep or rg.",
		"Use grep summary mode when you only need matching files or counts.",
		"Use ast_search instead of grep when the query depends on code structure.",
	],
});

const grepSchema = Type.Object({
	pattern: Type.String({ description: "Pattern to search" }),
	path: Type.Optional(Type.String({ description: "Search path" })),
	glob: Type.Optional(Type.String({ description: "Glob filter" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Ignore case" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat pattern literally" })),
	context: Type.Optional(
		Type.Union([
			Type.Number({ description: "Context lines" }),
			Type.String({ description: "Context lines" }),
		]),
	),
	limit: Type.Optional(
		Type.Union([
			Type.Number({ description: "Max matches" }),
			Type.String({ description: "Max matches" }),
		]),
	),
	summary: Type.Optional(Type.Boolean({ description: "Return per-file counts" })),
	scope: Type.Optional(
		Type.Literal("symbol", {
			description: "Scope matches to symbols",
		}),
	),
	scopeContext: Type.Optional(
		Type.Union([
			Type.Number({ description: "Symbol context lines" }),
			Type.String({ description: "Symbol context lines" }),
		]),
	),
});

interface GrepParams {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number | string;
	limit?: number | string;
	summary?: boolean;
	scope?: "symbol";
	scopeContext?: number | string;
}

const MATCH_LINE_RE = /^(.*):(\d+): (.*)$/;
const CONTEXT_LINE_RE = /^(.*)-(\d+)- (.*)$/;

function parseGrepOutputLine(line: string):
	| { kind: "match"; displayPath: string; lineNumber: number; text: string }
	| { kind: "context"; displayPath: string; lineNumber: number; text: string }
	| null {
	const match = line.match(MATCH_LINE_RE);
	if (match) {
		return {
			kind: "match",
			displayPath: match[1],
			lineNumber: Number.parseInt(match[2], 10),
			text: match[3],
		};
	}

	const context = line.match(CONTEXT_LINE_RE);
	if (context) {
		return {
			kind: "context",
			displayPath: context[1],
			lineNumber: Number.parseInt(context[2], 10),
			text: context[3],
		};
	}

	return null;
}

export interface GrepIRLine {
	kind: "match" | "context" | "separator";
	raw: string;
}

export interface GrepIRFile {
	path: string;
	matchCount: number;
	lines: GrepIRLine[];
}

export interface GrepIR {
	totalMatches: number;
	files: GrepIRFile[];
}

interface GrepPtcRecord {
	path: string;
	line: number;
	hash: string;
	anchor: string;
	kind: "match" | "context";
	raw: string;
	display: string;
}

function collectPtcRecordsFromIR(
	ir: GrepIR,
	recordByRenderedLine: Map<string, GrepPtcRecord>,
): GrepPtcRecord[] {
	const records: GrepPtcRecord[] = [];
	for (const file of ir.files) {
		for (const line of file.lines) {
			if (line.kind === "separator") continue;
			const record = recordByRenderedLine.get(line.raw);
			if (record) records.push(record);
		}
	}
	return records;
}

const IR_MATCH_LINE_RE = /^(.+?):>>/;
const IR_CONTEXT_LINE_RE = /^(.+?):  /;

export function parseGrepIR(lines: string[]): GrepIR {
	const fileMap = new Map<string, GrepIRFile>();
	let totalMatches = 0;

	for (const line of lines) {
		const matchResult = line.match(IR_MATCH_LINE_RE);
		let filePath: string | undefined;
		let kind: "match" | "context" = "context";

		if (matchResult) {
			filePath = matchResult[1];
			kind = "match";
			totalMatches++;
		} else {
			const contextResult = line.match(IR_CONTEXT_LINE_RE);
			if (contextResult) {
				filePath = contextResult[1];
				kind = "context";
			}
		}

		if (!filePath) continue;

		let file = fileMap.get(filePath);
		if (!file) {
			file = { path: filePath, matchCount: 0, lines: [] };
			fileMap.set(filePath, file);
		}

		file.lines.push({ kind, raw: line });
		if (kind === "match") file.matchCount++;
	}

	return { totalMatches, files: [...fileMap.values()] };
}

export function formatGrepOutput(ir: GrepIR, options?: { summary?: boolean; limit?: number }): string {
	const header = `[${ir.totalMatches} matches in ${ir.files.length} files]`;
	if (ir.files.length === 0) return header;
	let output: string;
	if (options?.summary) {
		const fileLines = [...ir.files]
			.sort((a, b) => b.matchCount - a.matchCount)
			.map((f) => `${f.path}: ${f.matchCount} matches`);
		output = [header, ...fileLines].join("\n");
	} else {
		const blocks: string[] = [header];
		for (const file of ir.files) {
			blocks.push(`--- ${file.path} (${file.matchCount} matches) ---`);
			for (const line of file.lines) {
				blocks.push(line.raw);
			}
		}
		output = blocks.join("\n");
	}

	if (options?.limit !== undefined && ir.totalMatches === options.limit) {
		output += `\n\n[Results truncated at ${options.limit} matches — refine pattern or increase limit]`;
	}

	return output;
}

const GREP_TRUNCATION_THRESHOLD = 50;
const GREP_MAX_MATCHES_PER_FILE = 10;

export function truncateGrepIR(ir: GrepIR): GrepIR {
	if (ir.totalMatches <= GREP_TRUNCATION_THRESHOLD) return ir;

	const files = ir.files.map((file) => {
		let matchesSeen = 0;
		const keptLines: GrepIRLine[] = [];
		let truncatedCount = 0;

		for (const line of file.lines) {
			if (line.kind === "match") {
				matchesSeen++;
				if (matchesSeen <= GREP_MAX_MATCHES_PER_FILE) {
					keptLines.push(line);
				} else {
					truncatedCount++;
				}
			} else if (matchesSeen <= GREP_MAX_MATCHES_PER_FILE) {
				keptLines.push(line);
			}
		}

		if (truncatedCount > 0) {
			keptLines.push({
				kind: "separator",
				raw: `... +${truncatedCount} more matches`,
			});
		}

		return { ...file, lines: keptLines };
	});

	return { ...ir, files };
}

const LINE_NUM_RE = /(?:>>|  )(\d+):/;

export function deduplicateContext(lines: GrepIRLine[]): GrepIRLine[] {
	if (lines.length === 0) return lines;

	const byLineNum = new Map<number, GrepIRLine>();
	for (const line of lines) {
		const match = line.raw.match(LINE_NUM_RE);
		if (!match) continue;
		const lineNum = Number.parseInt(match[1], 10);
		const existing = byLineNum.get(lineNum);
		if (!existing || (line.kind === "match" && existing.kind === "context")) {
			byLineNum.set(lineNum, line);
		}
	}

	const sorted = [...byLineNum.entries()].sort(([a], [b]) => a - b);
	const result: GrepIRLine[] = [];

	for (let i = 0; i < sorted.length; i++) {
		if (i > 0 && sorted[i][0] > sorted[i - 1][0] + 1) {
			result.push({ kind: "separator", raw: "--" });
		}
		result.push(sorted[i][1]);
	}

	return result;
}

/**
 * Escape special regex characters in a literal string for use in `new RegExp()`.
 */
function escapeForRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface GrepToolOptions {
	astSearchGuideline?: string;
	onFileAnchored?: (absolutePath: string) => void;
}

export function registerGrepTool(pi: ExtensionAPI, options: GrepToolOptions = {}) {
	const ptc = {
		callable: true,
		enabled: true,
		policy: "read-only" as const,
		readOnly: true,
		pythonName: "grep",
		defaultExposure: "safe-by-default" as const,
	};

	const tool = {
		name: "grep",
		label: "grep",
		description: GREP_PROMPT_METADATA.description,
		parameters: grepSchema,
		ptc,
		promptSnippet: GREP_PROMPT_METADATA.promptSnippet,
		promptGuidelines: options.astSearchGuideline
			? [GREP_PROMPT_METADATA.promptGuidelines[0], options.astSearchGuideline]
			: GREP_PROMPT_METADATA.promptGuidelines,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			await ensureHashInit();
			const rawParams = params as GrepParams;
			const context = coerceObviousBase10Int(rawParams.context, "context");
			if (!context.ok) {
				return {
					content: [{ type: "text", text: context.message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "grep",
							ok: false,
							error: buildPtcError("invalid-params-combo", context.message),
						},
					},
				};
			}
			const limit = coerceObviousBase10Int(rawParams.limit, "limit");
			if (!limit.ok) {
				return {
					content: [{ type: "text", text: limit.message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "grep",
							ok: false,
							error: buildPtcError("invalid-limit", limit.message),
						},
					},
				};
			}
			const scopeContext = coerceObviousBase10Int(rawParams.scopeContext, "scopeContext");
			if (!scopeContext.ok) {
				return {
					content: [{ type: "text", text: scopeContext.message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "grep",
							ok: false,
							error: buildPtcError("invalid-params-combo", scopeContext.message),
						},
					},
				};
			}
			if (scopeContext.value !== undefined && rawParams.scope !== "symbol") {
				const message = 'Invalid scopeContext: requires scope: "symbol". For normal surrounding-line context outside symbol scope, use the `context` parameter.';
				return {
					content: [{
						type: "text",
						text: message,
					}],
					isError: true,
					details: {
						ptcValue: {
							tool: "grep",
							ok: false,
							error: buildPtcError("invalid-params-combo", message),
						},
					},
				};
			}
			if (scopeContext.value !== undefined && scopeContext.value < 0) {
				const message = `Invalid scopeContext: expected a non-negative integer, received ${scopeContext.value}.`;
				return {
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "grep",
							ok: false,
							error: buildPtcError("invalid-params-combo", message),
						},
					},
				};
			}
			const p: GrepParams = {
				...rawParams,
				context: context.value,
				limit: limit.value,
				scopeContext: scopeContext.value,
			};
			const builtin = createGrepTool(ctx.cwd);
			const result = await builtin.execute(
				toolCallId,
				{
					...p,
					context: context.value,
					limit: limit.value,
				},
				signal,
				onUpdate,
			);

			const textBlock = result.content?.find(
				(item): item is { type: "text"; text: string } =>
					item.type === "text" && "text" in item && typeof (item as { text?: unknown }).text === "string",
			);
			if (!textBlock?.text) return result;

			const { path: rawSearchPath } = p;
			const searchPath = resolveToCwd(rawSearchPath || ".", ctx.cwd);

			let searchPathIsDirectory = false;
			try {
				searchPathIsDirectory = (await fsStat(searchPath)).isDirectory();
			} catch {
				searchPathIsDirectory = false;
			}
			// Warn when the user targets a single binary file directly — grep
			// silently skips binary files and would return 0 matches with no
			// indication of why.
			if (!searchPathIsDirectory) {
				try {
					const buf = await fsReadFile(searchPath);
					if (looksLikeBinary(buf)) {
						const warning = `[Warning: '${p.path ?? searchPath}' appears to be a binary file — grep skips binary files by default. Use a hex tool or the read tool to inspect it.]`;
						return {
							...result,
							content: result.content.map((item) =>
								item === textBlock ? ({ ...item, text: warning } as typeof item) : item,
							),
							details: {
								...(typeof result.details === "object" && result.details !== null ? result.details : {}),
								ptcValue: {
									tool: "grep",
									summary: !!p.summary,
									totalMatches: 0,
									records: [],
								},
							},
						};
					}
				} catch {
					// can't read file — let normal flow continue
				}
			}

			const fileCache = new Map<string, string[] | undefined>();
			const bareCRFiles = new Set<string>();
			const getFileLines = async (absolutePath: string): Promise<string[] | undefined> => {
				throwIfAborted(signal);
				if (fileCache.has(absolutePath)) return fileCache.get(absolutePath);
				try {
					const rawBuffer = await fsReadFile(absolutePath);
					if (looksLikeBinary(rawBuffer)) {
						fileCache.set(absolutePath, undefined);
						return undefined;
					}
					const raw = rawBuffer.toString("utf-8");
					if (hasBareCarriageReturn(raw)) bareCRFiles.add(absolutePath);
					const lines = normalizeToLF(stripBom(raw).text).split("\n");
					fileCache.set(absolutePath, lines);
					return lines;
				} catch {
					fileCache.set(absolutePath, []);
					return [];
				}
			};

			const toAbsolutePath = (displayPath: string): string => {
				if (searchPathIsDirectory) return path.resolve(searchPath, displayPath);
				return searchPath;
			};

			const transformed: string[] = [];
			const passthroughLines: string[] = [];
			const recordByRenderedLine = new Map<string, GrepPtcRecord>();
			let parsedCount = 0;
			let candidateUnparsedCount = 0;
			const candidateLinePattern = /^.+(?::|-)\d+(?::|-)\s/;

			for (const line of textBlock.text.split("\n")) {
				throwIfAborted(signal);
				const parsed = parseGrepOutputLine(line);
				if (!parsed || !Number.isFinite(parsed.lineNumber) || parsed.lineNumber < 1) {
					if (candidateLinePattern.test(line)) {
						candidateUnparsedCount++;
					}
					const trimmed = line.trim();
					if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
						passthroughLines.push(trimmed);
					}
					transformed.push(line);
					continue;
				}
				parsedCount++;
				const absolute = toAbsolutePath(parsed.displayPath);
				const fileLines = await getFileLines(absolute);
				if (fileLines === undefined) continue;
				// Bare-CR remapping: rg treats the entire bare-CR file as line 1, and the
				// builtin grep tool may strip \r before this code sees the output. So
				// parsed.text is just the first CR-separated fragment and parsed.lineNumber
				// is always 1 — both are wrong for match lines. Only remap when
				// parsed.kind === "match"; context lines are irrelevant here (rg won’t
				// produce them for bare-CR files in any meaningful way).
				if (parsed.kind === "match" && bareCRFiles.has(absolute)) {
					const gp = p;
					const flags = gp.ignoreCase ? "i" : "";
					let patternRe: RegExp | null = null;
					try {
						patternRe = gp.literal
							? new RegExp(escapeForRegex(gp.pattern), flags)
							: new RegExp(gp.pattern, flags);
					} catch {
						// Malformed regex — fall through to normal anchor path
					}
					if (patternRe !== null) {
						let emitted = false;
						for (let i = 0; i < fileLines.length; i++) {
							if (!patternRe.test(fileLines[i])) continue;
							const lineNum = i + 1;
							const marker = ">>";
							const renderedLine = `${parsed.displayPath}:${marker}${formatHashlineDisplay(lineNum, fileLines[i])}`;
							transformed.push(renderedLine);
							const built = buildPtcLine(lineNum, fileLines[i]);
							recordByRenderedLine.set(renderedLine, {
								path: toAbsolutePath(parsed.displayPath),
								line: built.line,
								hash: built.hash,
								anchor: built.anchor,
								kind: "match",
								raw: built.raw,
								display: built.display,
							});
							emitted = true;
						}
						if (emitted) continue;
						// No lines matched — fall through to normal path
					}
				}
				// Normal (non-bare-CR) path
				const sourceLine = fileLines?.[parsed.lineNumber - 1] ?? parsed.text;
				const built = buildPtcLine(parsed.lineNumber, sourceLine);
				const marker = parsed.kind === "match" ? ">>" : "  ";
				const renderedDisplay = escapeControlCharsForDisplay(parsed.text);
				const renderedLine = `${parsed.displayPath}:${marker}${built.anchor}|${renderedDisplay}`;
				transformed.push(renderedLine);
				recordByRenderedLine.set(renderedLine, {
					path: toAbsolutePath(parsed.displayPath),
					line: built.line,
					hash: built.hash,
					anchor: built.anchor,
					kind: parsed.kind,
					raw: built.raw,
					display: renderedDisplay,
				});
			}

			if (parsedCount === 0 && candidateUnparsedCount > 0) {
				const warning =
					"[hashline grep passthrough] Unparsed grep format; returned original output.";
				const passthroughDetails =
					typeof result.details === "object" && result.details !== null
						? (result.details as Record<string, unknown>)
						: {};
				return {
					...result,
					content: result.content.map((item) =>
						item === textBlock ? ({ ...item, text: `${textBlock.text}\n\n${warning}` } as typeof item) : item,
					),
					details: {
						...passthroughDetails,
						hashlinePassthrough: true,
						hashlineWarning: warning,
						ptcValue: {
							tool: "grep",
							summary: !!p.summary,
							totalMatches: 0,
							records: [],
						},
					},
				};
			}

			const grepIR = parseGrepIR(transformed);
			for (const file of grepIR.files) {
				file.lines = deduplicateContext(file.lines);
			}
			const truncatedIR = truncateGrepIR(grepIR);
			const summary = p.summary;
			const effectiveLimit = typeof p.limit === "number" ? p.limit : 100;
			const outputIR = summary
				? {
					...truncatedIR,
					files: truncatedIR.files.map((file) => ({ ...file, path: toAbsolutePath(file.path) })),
				}
				: truncatedIR;
let renderedGroups = outputIR.files.map((file) => ({
	displayPath: file.path,
	absolutePath: summary ? file.path : toAbsolutePath(file.path),
	matchCount: file.matchCount,
	entries: file.lines.map((line) => {
		if (line.kind === "separator") {
			return { kind: "separator" as const, text: line.raw };
		}
		const record = recordByRenderedLine.get(line.raw);
		if (!record) {
			throw new Error(`Missing grep record for rendered line: ${line.raw}`);
		}
		return {
			kind: record.kind,
			line: {
				line: record.line,
				hash: record.hash,
				anchor: record.anchor,
				raw: record.raw,
				display: record.display,
			},
		};
	}),
}));

let ptcRecords = collectPtcRecordsFromIR(outputIR, recordByRenderedLine);
let scopeWarnings: import("./grep-output.js").GrepScopeWarning[] = [];

if (p.scope === "symbol" && !summary) {
	const fileLinesByPath = new Map<string, string[]>();
	const fileMapsByPath = new Map<string, Awaited<ReturnType<typeof getOrGenerateMap>>>();

	for (const group of renderedGroups) {
		const lines = await getFileLines(group.absolutePath);
		if (lines) fileLinesByPath.set(group.absolutePath, lines);
		fileMapsByPath.set(group.absolutePath, await getOrGenerateMap(group.absolutePath));
	}

	const scoped = scopeGrepGroupsToSymbols({
		groups: renderedGroups,
		fileLinesByPath,
		fileMapsByPath,
		contextLines: typeof p.context === "number" ? p.context : 0,
		scopeContext: typeof p.scopeContext === "number" ? p.scopeContext : undefined,
	});

	renderedGroups = scoped.groups;
	scopeWarnings = scoped.warnings;
	ptcRecords = renderedGroups.flatMap((group) =>
		group.entries.flatMap((entry) =>
			entry.kind === "separator"
				? []
				: [
					{
						path: group.absolutePath,
						kind: entry.kind,
						line: entry.line.line,
						hash: entry.line.hash,
						anchor: entry.line.anchor,
						raw: entry.line.raw,
						display: entry.line.display,
					},
				],
		),
	);
}
			const builtOutput = buildGrepOutput({
				summary: !!summary,
				totalMatches: grepIR.totalMatches,
				groups: renderedGroups,
				limit: effectiveLimit,
				records: ptcRecords,
				scopeMode: p.scope === "symbol" && !summary ? "symbol" : undefined,
				scopeWarnings,
				passthroughLines,
				rehydrate: buildGrepRehydrateDescriptor({
					pattern: p.pattern,
					path: p.path,
					glob: p.glob,
					literal: p.literal,
					ignoreCase: p.ignoreCase,
					context: p.context,
					summary: p.summary,
					scope: p.scope,
					scopeContext: p.scopeContext,
				}),
			});

			if (!summary && ptcRecords.length > 0) {
				const anchoredPaths = new Set(ptcRecords.map((record) => record.path));
				for (const absolutePath of anchoredPaths) {
					options.onFileAnchored?.(absolutePath);
				}
			}

			const existingDetails =
				typeof result.details === "object" && result.details !== null
					? (result.details as Record<string, unknown>)
					: {};
			const { linesTruncated: _ignoredLinesTruncated, truncation: _ignoredTruncation, ...compactDetails } = existingDetails;
			return {
				...result,
				content: result.content.map((item) =>
					item === textBlock ? ({ ...item, text: builtOutput.text } as typeof item) : item,
				),
				details: {
					...compactDetails,
					ptcValue: builtOutput.ptcValue,
					contextHygiene: builtOutput.contextHygiene,
				},
			};
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const context = rest[0] ?? {};
			const cwd = context.cwd ?? process.cwd();
			const { pattern, suffix } = formatGrepCallText(args);
			const rawPath = typeof args?.path === "string" && args.path !== "." ? args.path : undefined;
			const glob = typeof args?.glob === "string" ? args.glob : undefined;
			let text = `${renderToolLabel(theme, "grep")} ${theme.fg("accent", `/${pattern}/`)}`;
			if (suffix) {
				if (rawPath) {
					text += theme.fg("dim", " in ");
					text += linkToolPath(theme.fg("dim", rawPath), rawPath, cwd);
					if (glob) text += theme.fg("dim", ` ${glob}`);
				} else {
					text += theme.fg("dim", ` in ${suffix}`);
				}
			}
			return new Text(clampLineToWidth(text, context.width), 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string; width?: number } =
				rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = isRendererExpanded(options as any, context as any);
			const cwd = context.cwd ?? process.cwd();
			const width = (context as any).width ?? (options as any)?.width;

			if (isPartial) return new Text(clampLinesToWidth([summaryLine("pending search")], width).join("\n"), 0, 0);

			const content = result.content?.[0];
			const textContent = content?.type === "text" ? content.text : "";

			if (isError || result.isError) {
				const firstLine = textContent.split("\n")[0] || "Error";
				const body = expanded && textContent ? textContent : firstLine;
				return new Text(clampLinesToWidth(summaryLine(body).split("\n"), width).join("\n"), 0, 0);
			}

			const ptcValue = (result.details as any)?.ptcValue as {
				tool: "grep";
				summary: boolean;
				totalMatches: number;
				records: Array<{ path: string; kind: string }>;
			} | undefined;

			const hasBinaryWarning = textContent.includes("appears to be a binary file");

			const fileSet = new Set<string>();
			for (const r of ptcValue?.records ?? []) {
				if (r.path) fileSet.add(r.path);
			}

			const info = formatGrepResultText({
				totalMatches: ptcValue?.totalMatches ?? 0,
				summary: ptcValue?.summary ?? false,
				records: ptcValue?.records ?? [],
				fileCount: fileSet.size,
				hasBinaryWarning,
			});

			if (info.noMatches && !hasBinaryWarning) return new Text(summaryLine("no matches"), 0, 0);
			const matchCount = ptcValue?.totalMatches ?? 0;
			const matchWord = matchCount === 1 ? "match" : "matches";
			let text = summaryLine(`${matchCount} ${matchWord} returned`, { hidden: !!textContent && !expanded });
			for (const badge of info.badges) text += theme.fg(badge.startsWith("⚠") ? "warning" : "dim", `  ${badge}`);
			if (expanded && ptcValue?.records) {
				const fileCounts = new Map<string, number>();
				for (const r of ptcValue.records) if (r.path && r.kind === "match") fileCounts.set(r.path, (fileCounts.get(r.path) ?? 0) + 1);
				for (const [filePath, count] of [...fileCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
					const display = path.relative(cwd, filePath) || filePath;
					text += "\n" + theme.fg("dim", `  ${display} (${count})`);
				}
				if (fileCounts.size > 20) text += "\n" + theme.fg("muted", `  … and ${fileCounts.size - 20} more files`);
			}
			return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

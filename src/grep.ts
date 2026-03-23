import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { createGrepTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile as fsReadFile, stat as fsStat } from "fs/promises";
import path from "path";
import { normalizeToLF, stripBom, hasBareCarriageReturn } from "./edit-diff";
import { looksLikeBinary } from "./binary-detect";
import { ensureHashInit, formatHashlineDisplay } from "./hashline";
import { buildPtcLine } from "./ptc-value.js";
import { buildGrepOutput } from "./grep-output.js";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";
import { Text } from "@mariozechner/pi-tui";
import { formatGrepCallText, formatGrepResultText } from "./grep-render-helpers.js";

const GREP_DESC =
	"Search file contents for a pattern. Returns matching lines with LINE:HASH anchors for hashline edit workflows.";

const grepSchema = Type.Object({
	pattern: Type.String({ description: "Search pattern (regex or literal string)" }),
	path: Type.Optional(Type.String({ description: "Directory or file to search (default: current directory)" })),
	glob: Type.Optional(Type.String({ description: "Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search (default: false)" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat pattern as literal string instead of regex (default: false)" })),
	context: Type.Optional(Type.Number({ description: "Number of lines to show before and after each match (default: 0)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return (default: 100)" })),
	summary: Type.Optional(Type.Boolean({ description: "Return per-file match counts only (no hashline anchors)" })),
});

interface GrepParams {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number;
	limit?: number;
	summary?: boolean;
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

export function registerGrepTool(pi: ExtensionAPI) {
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
		description: GREP_DESC,
		parameters: grepSchema,
		ptc,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			await ensureHashInit();
			const p = params as GrepParams;
			const builtin = createGrepTool(ctx.cwd);
			const result = await builtin.execute(toolCallId, p, signal, onUpdate);

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
				const renderedLine = `${parsed.displayPath}:${marker}${built.line}:${built.hash}|${built.display}`;
				transformed.push(renderedLine);
				recordByRenderedLine.set(renderedLine, {
					path: toAbsolutePath(parsed.displayPath),
					line: built.line,
					hash: built.hash,
					anchor: built.anchor,
					kind: parsed.kind,
					raw: built.raw,
					display: built.display,
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
			const { summary, limit } = p;
			const effectiveLimit = limit ?? 100;
			const outputIR = summary
				? {
					...truncatedIR,
					files: truncatedIR.files.map((file) => ({ ...file, path: toAbsolutePath(file.path) })),
				}
				: truncatedIR;
const ptcRecords = collectPtcRecordsFromIR(outputIR, recordByRenderedLine);
const groups = outputIR.files.map((file) => ({
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
	const builtOutput = buildGrepOutput({
	summary: !!summary,
	totalMatches: grepIR.totalMatches,
	groups,
	limit: effectiveLimit,
	records: ptcRecords,
});

return {
	...result,
	content: result.content.map((item) =>
		item === textBlock ? ({ ...item, text: builtOutput.text } as typeof item) : item,
	),
	details: {
		...(typeof result.details === "object" && result.details !== null ? result.details : {}),
		ptcValue: builtOutput.ptcValue,
	},
};
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const _context = rest[0];
			const { pattern, suffix } = formatGrepCallText(args);

			let text = theme.fg("toolTitle", theme.bold("grep "));
			text += theme.fg("accent", pattern);
			if (suffix) {
				text += theme.fg("dim", ` ${suffix}`);
			}
			return new Text(text, 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string } =
				rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = context.expanded ?? (options as any)?.expanded ?? false;
			const cwd = context.cwd ?? process.cwd();

			if (isPartial) return new Text(theme.fg("warning", "Searching\u2026"), 0, 0);

			const content = result.content?.[0];
			const textContent = content?.type === "text" ? content.text : "";

			if (isError || result.isError) {
				const firstLine = textContent.split("\n")[0] || "Error";
				return new Text(theme.fg("error", firstLine), 0, 0);
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

			if (info.noMatches && !hasBinaryWarning) {
				return new Text(theme.fg("muted", "No matches"), 0, 0);
			}

			const parts: string[] = [];
			if (info.summary) {
				parts.push(theme.fg(info.truncated ? "warning" : "success", info.summary));
			}

			for (const badge of info.badges) {
				if (badge.startsWith("\u26a0")) {
					parts.push(theme.fg("warning", badge));
				} else {
					parts.push(theme.fg("dim", badge));
				}
			}

			let text = parts.join("  ") || theme.fg("muted", "No matches");

			if (expanded && ptcValue?.records) {
				const fileCounts = new Map<string, number>();
				for (const r of ptcValue.records) {
					if (r.path && r.kind === "match") {
						fileCounts.set(r.path, (fileCounts.get(r.path) ?? 0) + 1);
					}
				}
				const entries = [...fileCounts.entries()].sort((a, b) => b[1] - a[1]);
				const showEntries = entries.slice(0, 20);
				for (const [filePath, count] of showEntries) {
					const display = path.relative(cwd, filePath) || filePath;
					text += "\n" + theme.fg("dim", `  ${display} (${count})`);
				}
				if (entries.length > 20) {
					text += "\n" + theme.fg("muted", `  \u2026 and ${entries.length - 20} more files`);
				}
			}

			return new Text(text, 0, 0);
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

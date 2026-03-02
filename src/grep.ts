import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createGrepTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile as fsReadFile, stat as fsStat } from "fs/promises";
import path from "path";
import { normalizeToLF, stripBom } from "./edit-diff";
import { computeLineHash, ensureHashInit } from "./hashline";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";

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
});

interface GrepParams {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number;
	limit?: number;
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

export function formatGrepOutput(ir: GrepIR): string {
	const header = `[${ir.totalMatches} matches in ${ir.files.length} files]`;
	if (ir.files.length === 0) return header;

	const blocks: string[] = [header];
	for (const file of ir.files) {
		blocks.push(`--- ${file.path} (${file.matchCount} matches) ---`);
		for (const line of file.lines) {
			blocks.push(line.raw);
		}
	}

	return blocks.join("\n");
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

export function registerGrepTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "grep",
		label: "grep",
		description: GREP_DESC,
		parameters: grepSchema,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			await ensureHashInit();
			const builtin = createGrepTool(ctx.cwd);
			const result = await builtin.execute(toolCallId, params, signal, onUpdate);

			const textBlock = result.content?.find(
				(item): item is { type: "text"; text: string } =>
					item.type === "text" && "text" in item && typeof (item as { text?: unknown }).text === "string",
			);
			if (!textBlock?.text) return result;

			const { path: rawSearchPath } = params as GrepParams;
			const searchPath = resolveToCwd(rawSearchPath || ".", ctx.cwd);

			let searchPathIsDirectory = false;
			try {
				searchPathIsDirectory = (await fsStat(searchPath)).isDirectory();
			} catch {
				searchPathIsDirectory = false;
			}

			const fileCache = new Map<string, string[] | undefined>();
			const getFileLines = async (absolutePath: string): Promise<string[] | undefined> => {
				throwIfAborted(signal);
				if (fileCache.has(absolutePath)) return fileCache.get(absolutePath);
				try {
					const rawBuffer = await fsReadFile(absolutePath);
					if (rawBuffer.includes(0)) {
						fileCache.set(absolutePath, undefined);
						return undefined;
					}
					const raw = rawBuffer.toString("utf-8");
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
				const sourceLine = fileLines?.[parsed.lineNumber - 1] ?? parsed.text;
				const ref = `${parsed.lineNumber}:${computeLineHash(parsed.lineNumber, sourceLine)}`;
				const marker = parsed.kind === "match" ? ">>" : "  ";
				transformed.push(`${parsed.displayPath}:${marker}${ref}|${parsed.text}`);
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
					},
				};
			}

			const grepIR = parseGrepIR(transformed);
			for (const file of grepIR.files) {
				file.lines = deduplicateContext(file.lines);
			}
			const truncatedIR = truncateGrepIR(grepIR);
			const formattedOutput = formatGrepOutput(truncatedIR);
			return {
				...result,
				content: result.content.map((item) =>
					item === textBlock ? ({ ...item, text: formattedOutput } as typeof item) : item,
				),
			};
		},
	});
}

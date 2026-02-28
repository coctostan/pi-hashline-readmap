import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createGrepTool } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile as fsReadFile, stat as fsStat } from "fs/promises";
import path from "path";
import { normalizeToLF, stripBom } from "./edit-diff";
import { computeLineHash } from "./hashline";
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

export function registerGrepTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "grep",
		label: "grep",
		description: GREP_DESC,
		parameters: grepSchema,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
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

			const fileCache = new Map<string, string[]>();
			const getFileLines = async (absolutePath: string): Promise<string[] | undefined> => {
				throwIfAborted(signal);
				if (fileCache.has(absolutePath)) return fileCache.get(absolutePath);
				try {
					const raw = (await fsReadFile(absolutePath)).toString("utf-8");
					const lines = normalizeToLF(stripBom(raw).text).split("\n");
					fileCache.set(absolutePath, lines);
					return lines;
				} catch {
					fileCache.set(absolutePath, []);
					return undefined;
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

			return {
				...result,
				content: result.content.map((item) =>
					item === textBlock ? ({ ...item, text: transformed.join("\n") } as typeof item) : item,
				),
			};
		},
	});
}

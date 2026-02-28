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
import { access as fsAccess, readFile as fsReadFile, stat as fsStat } from "fs/promises";
import { constants } from "fs";
import { normalizeToLF, stripBom } from "./edit-diff";
import { computeLineHash } from "./hashline";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";
import { getOrGenerateMap } from "./map-cache";
import { formatFileMapWithBudget } from "./readmap/formatter.js";

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
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const rawPath = params.path.replace(/^@/, "");
			const absolutePath = resolveToCwd(rawPath, ctx.cwd);

			throwIfAborted(signal);
			try {
				await fsAccess(absolutePath, constants.R_OK);
			} catch {
				return {
					content: [{ type: "text", text: `File not found or not readable: ${rawPath}` }],
					isError: true,
					details: {},
				};
			}

			throwIfAborted(signal);
			const pathStat = await fsStat(absolutePath);
			if (pathStat.isDirectory()) {
				return {
					content: [{ type: "text", text: `Path is a directory: ${rawPath}. Use ls to inspect directories.` }],
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
			const raw = (await fsReadFile(absolutePath)).toString("utf-8");
			throwIfAborted(signal);

			const normalized = normalizeToLF(stripBom(raw).text);
			const allLines = normalized.split("\n");
			const total = allLines.length;

			const startLine = params.offset ? Math.max(1, params.offset) : 1;
			const endIdx = params.limit ? Math.min(startLine - 1 + params.limit, total) : total;
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

			if (truncation.truncated && !params.offset && !params.limit) {
				try {
					const fileMap = await getOrGenerateMap(absolutePath);
					if (fileMap) {
						const mapText = formatFileMapWithBudget(fileMap);
						text += "\n\n" + mapText;
					}
				} catch {
					// Map generation failed — still return hashlined content without map
				}
			}

			return {
				content: [{ type: "text", text }],
				details: { truncation: truncation.truncated ? truncation : undefined },
			};
		},
	});
}

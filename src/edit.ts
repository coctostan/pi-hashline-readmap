import { renderDiff, type ExtensionAPI, type EditToolDetails, type ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { readFileSync } from "fs";
import { readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import { detectLineEnding, generateCompactOrFullDiff, normalizeToLF, replaceText, restoreLineEndings, stripBom } from "./edit-diff";
import { applyHashlineEdits, computeLineHash, ensureHashInit, parseLineRef, type HashlineEditItem, escapeControlCharsForDisplay } from "./hashline";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";
import { buildEditOutput } from "./edit-output.js";
import { Text } from "@mariozechner/pi-tui";
import { formatEditCallText, formatEditResultText } from "./edit-render-helpers.js";

export function wrapWriteError(err: any, path: string): Error {
	const code = err?.code;
	if (code === "EACCES" || code === "EPERM") {
		return new Error(`Permission denied: ${path}`);
	}
	return new Error(`Failed to write file: ${path}`);
}

export function isBinaryBuffer(buf: Buffer): boolean {
	return buf.includes(0);
}

// ─── Schema ─────────────────────────────────────────────────────────────

const hashlineEditItemSchema = Type.Union([
	Type.Object({ set_line: Type.Object({ anchor: Type.String(), new_text: Type.String() }) }, { additionalProperties: true }),
	Type.Object(
		{ replace_lines: Type.Object({ start_anchor: Type.String(), end_anchor: Type.String(), new_text: Type.String() }) },
		{ additionalProperties: true },
	),
	Type.Object({ insert_after: Type.Object({ anchor: Type.String(), new_text: Type.String(), text: Type.Optional(Type.String()) }) }, { additionalProperties: true }),
	Type.Object(
		{ replace: Type.Object({ old_text: Type.String(), new_text: Type.String(), all: Type.Optional(Type.Boolean()) }) },
		{ additionalProperties: true },
	),
]);

const hashlineEditSchema = Type.Object(
	{
		path: Type.String({ description: "File path (relative or absolute)" }),
		edits: Type.Optional(Type.Array(hashlineEditItemSchema, { description: "Array of edit operations" })),
	},
	{ additionalProperties: true },
);

type HashlineParams = Static<typeof hashlineEditSchema>;

const EDIT_DESC = readFileSync(new URL("../prompts/edit.md", import.meta.url), "utf-8").trim();

// ─── Registration ───────────────────────────────────────────────────────

export function registerEditTool(pi: ExtensionAPI) {
	const ptc = {
		callable: true,
		enabled: true,
		policy: "mutating" as const,
		readOnly: false,
		pythonName: "edit",
		defaultExposure: "not-safe-by-default" as const,
	};

	const tool = {
		name: "edit",
		label: "Edit",
		description: EDIT_DESC,
		parameters: hashlineEditSchema,
		ptc,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			await ensureHashInit();
			const parsed = params as HashlineParams;
			const input = params as Record<string, unknown>;
			const rawPath = parsed.path;
			const path = rawPath.replace(/^@/, "");
			const absolutePath = resolveToCwd(path, ctx.cwd);
			throwIfAborted(signal);

			const legacyOldText =
				typeof input.oldText === "string"
					? input.oldText
					: typeof input.old_text === "string"
						? input.old_text
						: undefined;
			const legacyNewText =
				typeof input.newText === "string"
					? input.newText
					: typeof input.new_text === "string"
						? input.new_text
						: undefined;
			const hasLegacyInput = legacyOldText !== undefined || legacyNewText !== undefined;
			const hasEditsInput = Array.isArray(parsed.edits);

			let edits = parsed.edits ?? [];
			let legacyNormalizationWarning: string | undefined;
			if (!hasEditsInput && hasLegacyInput) {
				if (legacyOldText === undefined || legacyNewText === undefined) {
					throw new Error(
						"Legacy edit input requires both oldText/newText (or old_text/new_text) when 'edits' is omitted.",
					);
				}
				edits = [
					{
						replace: {
							old_text: legacyOldText,
							new_text: legacyNewText,
							...(typeof input.all === "boolean" ? { all: input.all } : {}),
						},
					},
				];
				legacyNormalizationWarning =
					"Legacy top-level oldText/newText input was normalized to edits[0].replace. Prefer the edits[] format.";
			}

			if (!edits.length) {
				return {
					content: [{ type: "text", text: "No edits provided." }],
					isError: true,
					details: { diff: "", firstChangedLine: undefined } as EditToolDetails,
				};
			}

			// Validate edit variant keys
			for (let i = 0; i < edits.length; i++) {
				throwIfAborted(signal);
				const e = edits[i] as Record<string, unknown>;
				if (("old_text" in e || "new_text" in e) && !("replace" in e)) {
					throw new Error(
						`edits[${i}] has top-level 'old_text'/'new_text'. Use {replace: {old_text, new_text}} or {set_line}, {replace_lines}, {insert_after}.`,
					);
				}
				if ("diff" in e) {
					throw new Error(
						`edits[${i}] contains 'diff' from patch mode. Hashline edit expects one of: {set_line}, {replace_lines}, {insert_after}, {replace}.`,
					);
				}
				const variantCount =
					Number("set_line" in e) +
					Number("replace_lines" in e) +
					Number("insert_after" in e) +
					Number("replace" in e);
				if (variantCount !== 1) {
					throw new Error(
						`edits[${i}] must contain exactly one of: 'set_line', 'replace_lines', 'insert_after', 'replace'. Got: [${Object.keys(e).join(", ")}].`,
					);
				}
			}

			const anchorEdits = edits.filter(
				(e): e is HashlineEditItem => "set_line" in e || "replace_lines" in e || "insert_after" in e,
			);
			const replaceEdits = edits.filter(
				(e): e is { replace: { old_text: string; new_text: string; all?: boolean } } => "replace" in e,
			);

			let rawBuffer: Buffer;
			try {
				rawBuffer = await fsReadFile(absolutePath);
			} catch (err: any) {
				const code = err?.code;
				if (code === "EISDIR") {
					throw new Error(`Path is a directory: ${path}`);
				}
				if (code === "ENOENT") {
					throw new Error(`File not found: ${path}`);
				}
				throw new Error(`File not readable: ${path}`);
			}
			if (isBinaryBuffer(rawBuffer)) {
				throw new Error(`Cannot edit binary file: ${path}`);
			}
			throwIfAborted(signal);
			const raw = rawBuffer.toString("utf-8");
			const { bom, text: content } = stripBom(raw);
			const originalEnding = detectLineEnding(content);
			const originalNormalized = normalizeToLF(content);
			let result = originalNormalized;

			const anchorResult = applyHashlineEdits(result, anchorEdits, signal);
			result = anchorResult.content;

			for (const r of replaceEdits) {
				throwIfAborted(signal);
				if (!r.replace.old_text.length) throw new Error("replace.old_text must not be empty.");
				const rep = replaceText(result, r.replace.old_text, r.replace.new_text, { all: r.replace.all ?? false });
				if (!rep.count) throw new Error(`Could not find text to replace in ${path}.`);
				result = rep.content;
			}

			if (originalNormalized === result) {
				let diagnostic = `No changes made to ${path}. The edits produced identical content.`;
				if (anchorResult.noopEdits?.length) {
					diagnostic +=
						"\n" +
						anchorResult.noopEdits
							.map(
								(e) =>
									`Edit ${e.editIndex}: replacement for ${e.loc} is identical to current content:\n  ${e.loc}| ${escapeControlCharsForDisplay(e.currentContent)}`,
							)
							.join("\n");
					diagnostic += "\nRe-read the file to see the current state.";
				} else {
					// Edits were not literally identical but heuristics normalized them back
					const lines = result.split("\n");
					const targetLines: string[] = [];
					for (const edit of edits) {
						const refs: string[] = [];
						if ("set_line" in edit) refs.push((edit as any).set_line.anchor);
						else if ("replace_lines" in edit) {
							refs.push((edit as any).replace_lines.start_anchor, (edit as any).replace_lines.end_anchor);
						} else if ("insert_after" in edit) refs.push((edit as any).insert_after.anchor);
						for (const ref of refs) {
							try {
								const parsed = parseLineRef(ref);
								if (parsed.line >= 1 && parsed.line <= lines.length) {
									const lineContent = lines[parsed.line - 1];
									const hash = computeLineHash(parsed.line, lineContent);
									targetLines.push(`${parsed.line}:${hash}|${escapeControlCharsForDisplay(lineContent)}`);
								}
							} catch {
								/* skip malformed refs */
							}
						}
					}
					if (targetLines.length > 0) {
						const preview = [...new Set(targetLines)].slice(0, 5).join("\n");
						diagnostic += `\nThe file currently contains:\n${preview}\nYour edits were normalized back to the original content. Ensure your replacement changes actual code, not just formatting.`;
					}
				}
				throw new Error(diagnostic);
			}

			throwIfAborted(signal);
			try {
				await fsWriteFile(absolutePath, bom + restoreLineEndings(result, originalEnding), "utf-8");
			} catch (err: any) {
				throw wrapWriteError(err, path);
			}

			const diffResult = generateCompactOrFullDiff(originalNormalized, result);
			const warnings: string[] = [];
			if (anchorResult.warnings?.length) warnings.push(...anchorResult.warnings);
			if (legacyNormalizationWarning) warnings.push(legacyNormalizationWarning);
			const builtOutput = buildEditOutput({
				path: absolutePath,
				displayPath: path,
				diff: diffResult.diff,
				firstChangedLine: anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
				warnings,
				noopEdits: anchorResult.noopEdits ?? [],
			});

			const warn = warnings.length ? `\n\nWarnings:\n${warnings.join("\n")}` : "";
			return {
				content: [{ type: "text", text: builtOutput.text }],
				details: {
					diff: diffResult.diff,
					firstChangedLine: anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
					ptcValue: builtOutput.ptcValue,
				} as EditToolDetails & {
					ptcValue: {
						tool: string;
						ok: boolean;
						path: string;
						summary: string;
						diff: string;
						firstChangedLine: number | undefined;
						warnings: string[];
						noopEdits: unknown[];
					};
				},
			};
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const context: { argsComplete?: boolean; lastComponent?: any } = rest[0] ?? {};
			const argsComplete = context.argsComplete ?? false;
			const { path: filePath, suffix } = formatEditCallText(args, argsComplete);

			let text = theme.fg("toolTitle", theme.bold("edit"));
			if (filePath) {
				text += ` ${theme.fg("accent", filePath)}`;
			} else {
				text += ` ${theme.fg("toolOutput", "...")}`;
			}
			if (suffix) {
				text += ` ${theme.fg("dim", suffix)}`;
			}

			const component = context.lastComponent ?? new Text("", 0, 0);
			component.setText(text);
			return component;
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; lastComponent?: any } =
				rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = context.expanded ?? (options as any)?.expanded ?? false;

			if (isPartial) {
				return new Text(theme.fg("dim", "Editing\u2026"), 0, 0);
			}

			// Extract data from result
			const textContent = result.content
				?.filter((c: any) => c.type === "text")
				.map((c: any) => c.text || "")
				.join("\n") ?? "";
			const details = result.details ?? {};
			const diff: string = details.diff ?? "";
			const ptcValue = details.ptcValue as {
				warnings?: string[];
				noopEdits?: unknown[];
			} | undefined;
			const warnings = ptcValue?.warnings ?? [];
			const noopEdits = ptcValue?.noopEdits ?? [];

			const info = formatEditResultText({
				isError: isError || !!result.isError,
				diff,
				warnings,
				noopEdits,
				errorText: textContent,
			});

			// Build display text
			let text = "";

			if (info.noOp) {
				// No-op error
				text = theme.fg("warning", "\u26a0 no-op");
				if (expanded && info.errorText) {
					text += `\n${theme.fg("error", info.errorText)}`;
				}
			} else if (info.errorText) {
				// Non-noop error
				const firstLine = info.errorText.split("\n")[0] || "Error";
				text = theme.fg("error", firstLine);
				if (expanded && info.errorText.includes("\n")) {
					text = theme.fg("error", info.errorText);
				}
			} else {
				// Success
				const parts: string[] = [];
				if (info.diffStats) {
					parts.push(theme.fg("success", info.diffStats));
				}
				if (info.warningsBadge) {
					parts.push(theme.fg("warning", info.warningsBadge));
				}
				text = parts.join("  ") || theme.fg("success", "\u2713");

				if (expanded) {
					if (diff) {
						text += `\n${renderDiff(diff)}`;
					}
					if (warnings.length > 0) {
						text += `\n${theme.fg("warning", "Warnings:")}`;
						for (const w of warnings) {
							text += `\n  ${theme.fg("dim", w)}`;
						}
					}
				}
			}

			const component = context.lastComponent ?? new Text("", 0, 0);
			component.setText(text);
			return component;
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

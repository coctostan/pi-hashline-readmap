import type { ExtensionAPI, EditToolDetails } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { readFileSync } from "fs";
import { readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import { detectLineEnding, generateCompactOrFullDiff, normalizeToLF, replaceText, restoreLineEndings, stripBom } from "./edit-diff";
import { applyHashlineEdits, computeLineHash, ensureHashInit, parseLineRef, type HashlineEditItem } from "./hashline";
import { resolveToCwd } from "./path-utils";
import { throwIfAborted } from "./runtime";

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
	Type.Object({ insert_after: Type.Object({ anchor: Type.String(), text: Type.String() }) }, { additionalProperties: true }),
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

export function registerEditTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "edit",
		label: "Edit",
		description: EDIT_DESC,
		parameters: hashlineEditSchema,

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
									`Edit ${e.editIndex}: replacement for ${e.loc} is identical to current content:\n  ${e.loc}| ${e.currentContent}`,
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
									targetLines.push(`${parsed.line}:${hash}|${lineContent}`);
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
			const warn = warnings.length ? `\n\nWarnings:\n${warnings.join("\n")}` : "";

			return {
				content: [{ type: "text", text: `Updated ${path}${warn}` }],
				details: {
					diff: diffResult.diff,
					firstChangedLine: anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
				} as EditToolDetails,
			};
		},
	});
}

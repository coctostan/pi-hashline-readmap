import { withFileMutationQueue, type ExtensionAPI, type EditToolDetails, type ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { readFile as fsReadFile } from "fs/promises";
import { createPatch } from "diff";
import { detectLineEnding, generateCompactOrFullDiff, normalizeToLF, replaceText, restoreLineEndings, stripBom } from "./edit-diff.js";
import { HashlineMismatchError, applyHashlineEdits, computeLineHash, ensureHashInit, parseLineRef, type HashlineEditItem, escapeControlCharsForDisplay } from "./hashline.js";
import { resolveToCwd } from "./path-utils.js";
import { resolveMutationTargetPath, writeFileAtomically } from "./fs-write.js";
import { throwIfAborted } from "./runtime.js";
import { buildEditOutput } from "./edit-output.js";
import { classifyEdit, isDifftAvailable, runDifftastic } from "./edit-classify.js";
import type { SemanticSummary } from "./ptc-value.js";
import { buildPtcError } from "./ptc-value.js";
import { Text } from "@earendil-works/pi-tui";
import { countEditTypes, formatEditCallText, formatEditResultText } from "./edit-render-helpers.js";
import { validateSyntaxRegression } from "./edit-syntax-validate.js";
import { resolveSyntaxValidateMode, type SyntaxValidateOptions } from "./syntax-validate-mode.js";
import { replaceSymbol } from "./replace-symbol.js";
import { buildEditPreviewKey, buildPendingEditPreviewData, resolvePendingDiffPreview, type PendingDiffPreviewResult } from "./pending-diff-preview.js";
import { buildDiffData, type DiffBlockRange } from "./diff-data.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, linkToolPath, summaryLine } from "./tui-render-utils.js";
import { DiffPreviewComponent } from "./tui-diff-component.js";
import { buildContextHygieneMetadata, buildFileResource, type ContextHygieneMetadata } from "./context-hygiene.js";
import { resolveEditDiffDisplay } from "./hashline-settings.js";

const EDIT_PENDING_PREVIEW_STATE_KEY = "hashline-edit-pending-preview";

function pendingPreviewLines(summary: string, preview: PendingDiffPreviewResult | undefined, expanded: boolean): { lines: string[]; diffData?: ReturnType<typeof buildDiffData>; headerLabel?: string } {
	if (!preview || preview.type !== "ok") return { lines: summary.split("\n") };
	const diffData = buildDiffData({ path: preview.data.filePath, oldContent: preview.data.previousContent, newContent: preview.data.nextContent, diff: preview.data.diff });
	const headerLine = summaryLine(preview.data.headerLabel, { hidden: !expanded });
	return { lines: [summary, headerLine], diffData: expanded ? diffData : undefined, headerLabel: preview.data.headerLabel };
}

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
		{ replace: Type.Object({ old_text: Type.String(), new_text: Type.String(), all: Type.Optional(Type.Boolean()), fuzzy: Type.Optional(Type.Boolean()) }) },
		{ additionalProperties: true },
	),
	Type.Object(
		{ replace_symbol: Type.Object({ symbol: Type.String(), new_body: Type.String() }) },
		{ additionalProperties: true },
	),
	Type.Object(
		{ old_text: Type.String(), new_text: Type.String() },
		{
			additionalProperties: true,
			description: "Do not use — Wrap as { replace: {old_text, new_text} }.",
		},
	),
]);

const hashlineEditSchema = Type.Object(
	{
		path: Type.String({ description: "File path" }),
		edits: Type.Optional(Type.Array(hashlineEditItemSchema, { description: "Edit operations" })),
		postEditVerify: Type.Optional(Type.Boolean({
			description: "Verify persisted content after write",
		})),
	},
	{ additionalProperties: true },
);

type HashlineParams = Static<typeof hashlineEditSchema>;

const EDIT_PROMPT_METADATA = defineToolPromptMetadata({
	promptUrl: new URL("../prompts/edit.md", import.meta.url),
	promptSnippet: "Edit files using hash-verified anchors from read/grep/ast_search/write",
	promptGuidelines: [
		"Use edit for changes to existing files; read or search first and copy fresh LINE:HASH anchors.",
		"Prefer edit anchored set_line, replace_lines, and insert_after over shell rewrites.",
		"Use edit replace only when anchored edits are impractical.",
	],
});

function buildEditError(
	path: string,
	code: string,
	message: string,
	hint?: string,
	errorDetails?: Record<string, unknown>,
	contextHygiene?: ContextHygieneMetadata,
): {
	content: [{ type: "text"; text: string }];
	isError: true;
	details: EditToolDetails & { ptcValue: any; contextHygiene?: ContextHygieneMetadata };
} {
	return {
		content: [{ type: "text", text: message }],
		isError: true,
		details: {
			diff: "",
			patch: "",
			firstChangedLine: undefined,
			ptcValue: {
				tool: "edit",
				ok: false,
				path,
				error: buildPtcError(code, message, hint, errorDetails),
			},
			...(contextHygiene ? { contextHygiene } : {}),
		} as EditToolDetails & { ptcValue: any; contextHygiene?: ContextHygieneMetadata },
	};
}

export interface EditToolOptions {
	wasReadInSession?: (absolutePath: string) => boolean;
	syntaxValidate?: SyntaxValidateOptions["syntaxValidate"];
}

// ─── Registration ───────────────────────────────────────────────────────

export function registerEditTool(pi: ExtensionAPI, options: EditToolOptions = {}) {
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
		description: EDIT_PROMPT_METADATA.description,
		promptSnippet: EDIT_PROMPT_METADATA.promptSnippet,
		promptGuidelines: EDIT_PROMPT_METADATA.promptGuidelines,
		parameters: hashlineEditSchema,
		ptc,
		renderShell: "default" as const,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			await ensureHashInit();
			const parsed = params as HashlineParams;
			const input = params as Record<string, unknown>;
			const rawPath = parsed.path;
			const path = rawPath.replace(/^@/, "");
			const absolutePath = resolveToCwd(path, ctx.cwd);
			throwIfAborted(signal);
			try {
				const queueKey = await resolveMutationTargetPath(absolutePath);
				return await withFileMutationQueue(queueKey, async () => {
				throwIfAborted(signal);
			if (options.wasReadInSession && !options.wasReadInSession(absolutePath)) {
				const message = [
					`You must get fresh anchors for ${absolutePath} before editing it.`,
					`Call read(${JSON.stringify(rawPath)}) first, or use grep, ast_search, or write to produce fresh anchors for this file.`,
					"edit requires fresh LINE:HASH anchors from read, grep, ast_search, or write so the hashes match the current file contents.",
				].join(" ");
				return buildEditError(
					absolutePath,
					"file-not-read",
					message,
					`Call read(${JSON.stringify(rawPath)}) first, or use grep, ast_search, or write to produce fresh anchors for this file.`,
				);
			}
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

			// Some models (Opus 4.6, GLM-5.1, qwen3.6) send `edits` as a JSON
			// string instead of an array. Coerce it back to an array; on parse
			// failure or non-array result, leave it unchanged so the existing
			// validation path produces a clear error.
			if (typeof (parsed as { edits?: unknown }).edits === "string") {
				try {
					const reparsed = JSON.parse((parsed as { edits?: unknown }).edits as string);
					if (Array.isArray(reparsed)) {
						(parsed as { edits?: unknown }).edits = reparsed;
						(input as { edits?: unknown }).edits = reparsed;
					}
				} catch {
					// fall through to existing validation error handling
				}
			}

			const hasEditsInput = Array.isArray(parsed.edits);

			let edits = Array.isArray(parsed.edits) ? parsed.edits : [];
			let legacyNormalizationWarning: string | undefined;
			if (!hasEditsInput && hasLegacyInput) {
				if (legacyOldText === undefined || legacyNewText === undefined) {
					const message =
						"Legacy edit input requires both oldText/newText (or old_text/new_text) when 'edits' is omitted.";
					return buildEditError(absolutePath, "invalid-edit-variant", message);
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
				return buildEditError(absolutePath, "invalid-edit-variant", "No edits provided.");
			}

			// Validate edit variant keys
			for (let i = 0; i < edits.length; i++) {
				throwIfAborted(signal);
				const e = edits[i] as Record<string, unknown>;
				if (("old_text" in e || "new_text" in e) && !("replace" in e)) {
					const message = `edits[${i}] has top-level 'old_text'/'new_text'. Use {replace: {old_text, new_text}} or {set_line}, {replace_lines}, {insert_after}.`;
					return buildEditError(absolutePath, "invalid-edit-variant", message);
				}
				if ("diff" in e) {
					const message = `edits[${i}] contains 'diff' from patch mode. Hashline edit expects one of: {set_line}, {replace_lines}, {insert_after}, {replace}.`;
					return buildEditError(absolutePath, "invalid-edit-variant", message);
				}
				const variantCount =
					Number("set_line" in e) +
					Number("replace_lines" in e) +
					Number("insert_after" in e) +
					Number("replace" in e) +
					Number("replace_symbol" in e);
				if (variantCount !== 1) {
					const message = `edits[${i}] must contain exactly one of: 'set_line', 'replace_lines', 'insert_after', 'replace', 'replace_symbol'. Got: [${Object.keys(e).join(", ")}].`;
					return buildEditError(absolutePath, "invalid-edit-variant", message);
				}
			}

			const anchorEdits = edits.filter(
				(e): e is HashlineEditItem => "set_line" in e || "replace_lines" in e || "insert_after" in e,
			);
			const replaceEdits = edits.filter(
				(e): e is { replace: { old_text: string; new_text: string; all?: boolean; fuzzy?: boolean } } => "replace" in e,
			);
			const replaceSymbolEdits = edits.filter(
				(e): e is { replace_symbol: { symbol: string; new_body: string } } => "replace_symbol" in e,
			);
			for (const rs of replaceSymbolEdits) {
				if (!rs.replace_symbol.new_body.trim()) {
					return buildEditError(absolutePath, "invalid-edit-variant", "replace_symbol.new_body must not be empty or whitespace-only.");
				}
			}

			let rawBuffer: Buffer;
			try {
				rawBuffer = await fsReadFile(absolutePath);
			} catch (err: any) {
				const code = err?.code;
				let errCode: string;
				let message: string;
				let hint: string | undefined;
				let errorDetails: { fsCode?: string; fsMessage?: string } | undefined;
				if (code === "EISDIR") {
					errCode = "path-is-directory";
					message = `Path is a directory: ${path}`;
					hint = `Use ls(${JSON.stringify(path)}) to inspect directories.`;
				} else if (code === "ENOENT") {
					errCode = "file-not-found";
					message = `File not found: ${path}`;
				} else if (code === "EACCES" || code === "EPERM") {
					errCode = "permission-denied";
					message = `Permission denied: ${path}`;
				} else {
					errCode = "fs-error";
					message = `File not readable: ${path}${err?.message ? ` — ${err.message}` : ""}`;
					errorDetails = { fsCode: code, fsMessage: err?.message };
				}
				return buildEditError(absolutePath, errCode, message, hint, errorDetails);
			}
			if (isBinaryBuffer(rawBuffer)) {
				const message = `Cannot edit binary file: ${path}`;
				return buildEditError(absolutePath, "binary-file", message);
			}
			throwIfAborted(signal);
			const raw = rawBuffer.toString("utf-8");
			const { bom, text: content } = stripBom(raw);
			const originalEnding = detectLineEnding(content);
			const originalNormalized = normalizeToLF(content);
			let preAnchorContent = originalNormalized;
			// AC 26: reject anchored edits that target a line inside any replace_symbol
			// pre-replace range. Resolve each target against the ORIGINAL content so the
			// user-provided anchor line numbers (which reference the file as read) are
			// compared against the pre-replace coordinates.
			//
			// F2: surface replace_symbol symbol-resolution errors (not-found, ambiguous)
			// BEFORE the AC 26 overlap check and before any write (C1 preserved).
			// Error-precedence order: replace_symbol resolution > anchor-overlap > anchored-edit.
			//
			// AC 4: store successful probe results and reuse them in the apply loop so
			// generateMapFromContent is invoked at most once per replace_symbol edit.
			const replaceSymbolRanges: { start: number; end: number }[] = [];
			const rsProbeResults: { type: "ok"; content: string; replacement: string; warnings: string[]; range: { start: number; end: number } }[] = [];
			for (const rs of replaceSymbolEdits) {
				const probe = await replaceSymbol({
					filePath: absolutePath,
					content: originalNormalized,
					symbol: rs.replace_symbol.symbol,
					newBody: rs.replace_symbol.new_body,
				});
				if (probe.type !== "ok") {
					// F2: symbol-resolution errors surface before AC 26 overlap check.
					return buildEditError(absolutePath, "invalid-edit-variant", probe.message);
				}
				rsProbeResults.push(probe);
				replaceSymbolRanges.push(probe.range);
			}

			const sortedReplaceSymbolRanges = [...replaceSymbolRanges].sort((a, b) => a.start - b.start || a.end - b.end);
			for (let i = 1; i < sortedReplaceSymbolRanges.length; i++) {
				const prev = sortedReplaceSymbolRanges[i - 1];
				const current = sortedReplaceSymbolRanges[i];
				if (current.start <= prev.end) {
					const message = `replace_symbol ranges overlap or duplicate (lines ${prev.start}-${prev.end} and ${current.start}-${current.end}).`;
					return buildEditError(absolutePath, "invalid-edit-variant", message);
				}
			}
			if (replaceSymbolRanges.length > 0) {
				for (const edit of anchorEdits) {
					if ("replace_lines" in edit) {
						let startLine: number | undefined;
						let endLine: number | undefined;
						try {
							startLine = parseLineRef((edit as any).replace_lines.start_anchor).line;
							endLine = parseLineRef((edit as any).replace_lines.end_anchor).line;
						} catch {
							// Let the normal anchored edit validation report malformed anchors later.
						}
						if (startLine !== undefined && endLine !== undefined) {
							const lo = Math.min(startLine, endLine);
							const hi = Math.max(startLine, endLine);
							for (const range of replaceSymbolRanges) {
								if (lo <= range.end && hi >= range.start) {
									const message = `replace_lines range ${lo}-${hi} overlaps a replace_symbol range (lines ${range.start}-${range.end}).`;
						return buildEditError(absolutePath, "invalid-edit-variant", message);
								}
							}
						}
					}
					const refs: string[] = [];
					if ("set_line" in edit) refs.push((edit as any).set_line.anchor);
					else if ("replace_lines" in edit) {
						refs.push((edit as any).replace_lines.start_anchor, (edit as any).replace_lines.end_anchor);
					} else if ("insert_after" in edit) refs.push((edit as any).insert_after.anchor);
					for (const ref of refs) {
						let parsedLine: number | undefined;
						try {
							parsedLine = parseLineRef(ref).line;
						} catch {
							continue;
						}
						for (const range of replaceSymbolRanges) {
							if (parsedLine >= range.start && parsedLine <= range.end) {
								const message = `Anchor at line ${parsedLine} falls inside a replace_symbol range (lines ${range.start}-${range.end}).`;
						return buildEditError(absolutePath, "invalid-edit-variant", message);
							}
						}
					}
				}
			}
			// Apply pass: reuse all probe results (AC 4). The probe pass resolved every
			// replace_symbol against originalNormalized; apply those replacements in
			// reverse source order so original line ranges stay valid and no second
			// replaceSymbol/generateMapFromContent call is needed.
			const replaceSymbolWarnings: string[] = [];
			if (rsProbeResults.length > 0) {
				const lines = originalNormalized.split("\n");
				for (const probe of rsProbeResults) {
					replaceSymbolWarnings.push(...probe.warnings);
				}
				for (const probe of [...rsProbeResults].sort((a, b) => b.range.start - a.range.start)) {
					lines.splice(
						probe.range.start - 1,
						probe.range.end - probe.range.start + 1,
						...probe.replacement.split("\n"),
					);
				}
				preAnchorContent = lines.join("\n");
			}
			let result = preAnchorContent;

			let anchorResult;
			try {
				anchorResult = applyHashlineEdits(result, anchorEdits, signal);
			} catch (err) {
				if (err instanceof HashlineMismatchError) {
					return buildEditError(absolutePath, "hash-mismatch", err.message, undefined, {
						updatedAnchors: err.updatedAnchors,
					});
				}
				throw err;
			}
			result = anchorResult.content;

			const replaceWarnings: string[] = [];
			for (const r of replaceEdits) {
				throwIfAborted(signal);
				if (!r.replace.old_text.length) {
					const message = "replace.old_text must not be empty.";
					return buildEditError(absolutePath, "invalid-edit-variant", message);
				}
				const rep = replaceText(result, r.replace.old_text, r.replace.new_text, {
					all: r.replace.all ?? false,
					fuzzy: r.replace.fuzzy ?? false,
				});
				if (!rep.count) {
					const message = `Could not find exact text to replace in ${path}.`;
					const hint =
						"Re-read the file and prefer set_line/replace_lines/insert_after for hash-verified edits. " +
						"The replace variant is exact-only by default because fuzzy fallback is unverified.";
					return buildEditError(absolutePath, "text-not-found", message, hint);
				}
				if (rep.usedFuzzyMatch) {
					replaceWarnings.push(
						"replace used fuzzy matching because exact old_text was not found; re-read the file and prefer set_line/replace_lines/insert_after for hash-verified edits.",
					);
				}
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
				return buildEditError(absolutePath, "no-op", diagnostic);
			}

			throwIfAborted(signal);

			// Syntax-regression validator (warn/block/off)
			const syntaxMode = resolveSyntaxValidateMode({ syntaxValidate: options.syntaxValidate });
			let syntaxWarning: string | undefined;
			if (syntaxMode !== "off") {
				const regression = await validateSyntaxRegression({
					filePath: absolutePath,
					before: originalNormalized,
					after: result,
				});
				if (regression) {
					const lines = regression.errorLines.join(", ");
					const message = `syntax-regression: lines ${lines}`;
					// Task 7 (AC 12): block mode aborts with syntax-regression code; file is left untouched.
					if (syntaxMode === "block") {
						return buildEditError(absolutePath, "syntax-regression", message);
					}
					syntaxWarning = message;
				}
			}
			const writeContent = bom + restoreLineEndings(result, originalEnding);
			try {
				await writeFileAtomically(absolutePath, writeContent);
			} catch (err: any) {
				const wrapped = wrapWriteError(err, path);
				const code =
					err?.code === "EACCES" || err?.code === "EPERM"
						? "permission-denied"
						: err?.code === "ENOENT"
							? "file-not-found"
							: "fs-error";
				const message =
					code === "fs-error" && err?.message ? `${wrapped.message} — ${err.message}` : wrapped.message;
				return buildEditError(absolutePath, code, message, undefined, code === "fs-error"
					? { fsCode: err?.code, fsMessage: err?.message }
					: undefined);
			}

			if (input.postEditVerify === true) {
				const postWriteMutationContextHygiene = buildContextHygieneMetadata({
					tool: "edit",
					classification: "mutation",
					resources: [buildFileResource(absolutePath)],
				});
				let verifiedContent: string;
				try {
					const verified = await fsReadFile(absolutePath, "utf-8");
					verifiedContent = verified;
				} catch (err: any) {
					const message = `Edit write completed but post-edit verification failed: could not read ${path} after writing.`;
					return buildEditError(absolutePath, "post-edit-verification-read-failed", message, undefined, {
							fsCode: err?.code,
							fsMessage: err?.message,
						},
						postWriteMutationContextHygiene,
					);
				}
				if (verifiedContent !== writeContent) {
					const message = `Edit write completed but post-edit verification did not confirm the intended content for ${path}. Re-read the file before making follow-up edits.`;
					return buildEditError(absolutePath, "post-edit-verification-mismatch", message, undefined, {
							expectedLength: writeContent.length,
							actualLength: verifiedContent.length,
						},
						postWriteMutationContextHygiene,
					);
				}
			}

			const diffResult = generateCompactOrFullDiff(originalNormalized, result);
			const patch = createPatch(path, originalNormalized, result);
			const blockRanges: DiffBlockRange[] = rsProbeResults.map((probe) => ({
				kind: "remove" as const,
				startLine: probe.range.start,
				endLine: probe.range.end,
			}));
			const diffData = buildDiffData({
				path: absolutePath,
				oldContent: originalNormalized,
				newContent: result,
				diff: diffResult.diff,
				...(blockRanges.length ? { blockRanges } : {}),
			});
			const warnings: string[] = [];
			if (anchorResult.warnings?.length) warnings.push(...anchorResult.warnings);
			if (legacyNormalizationWarning) warnings.push(legacyNormalizationWarning);
			if (replaceWarnings.length) warnings.push(...replaceWarnings);
			if (replaceSymbolWarnings.length) warnings.push(...replaceSymbolWarnings);
			if (syntaxWarning) warnings.push(syntaxWarning);
			// Semantic classification
			const internalClassification = classifyEdit(originalNormalized, result);
			const difftAvailable = await isDifftAvailable();
			let semanticSummary: SemanticSummary = {
				classification: internalClassification.classification,
				difftasticAvailable: difftAvailable,
			};

			if (difftAvailable) {
				const ext = path.split(".").pop() ?? "txt";
				const difftResult = await runDifftastic(originalNormalized, result, ext);
				if (difftResult) {
					semanticSummary = {
						classification: difftResult.classification,
						difftasticAvailable: true,
						...(difftResult.movedBlocks > 0 ? { movedBlocks: difftResult.movedBlocks } : {}),
					};
				}
			}
			const builtOutput = buildEditOutput({
				path: absolutePath,
				displayPath: path,
				diff: diffResult.diff,
				patch,
				diffData,
				firstChangedLine: anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
				warnings,
				noopEdits: anchorResult.noopEdits ?? [],
				edits,
				semanticSummary,
			});

			const warn = warnings.length ? `\n\nWarnings:\n${warnings.join("\n")}` : "";
			return {
				content: [{ type: "text", text: builtOutput.text }],
				details: {
					diff: diffResult.diff,
					patch: builtOutput.patch,
					diffData,
					firstChangedLine: anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
					ptcValue: builtOutput.ptcValue,
					contextHygiene: builtOutput.contextHygiene,
				} as EditToolDetails & {
					diffData: typeof diffData;
					ptcValue: {
						tool: string;
						ok: boolean;
						path: string;
						summary: string;
						diff: string;
						diffData: typeof diffData;
						firstChangedLine: number | undefined;
						warnings: string[];
						noopEdits: unknown[];
					};
					contextHygiene: ContextHygieneMetadata;
				},
			};
				});
			} catch (err: any) {
				const code = err?.code;
				if (typeof code === "string") {
					const message = `File not readable: ${path}${err?.message ? ` — ${err.message}` : ""}`;
					return buildEditError(absolutePath, "fs-error", message, undefined, { fsCode: code, fsMessage: err?.message });
				}
				throw err;
			}
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const context: { argsComplete?: boolean; executionStarted?: boolean; lastComponent?: any; cwd?: string; state?: Record<string, any>; invalidate?: () => void; width?: number; expanded?: boolean } = rest[0] ?? {};
			const cwd = context.cwd ?? process.cwd();
			const argsComplete = context.argsComplete ?? false;
			const { path: filePath, suffix } = formatEditCallText(args, argsComplete);

			let text = theme.fg("toolTitle", theme.bold("edit"));
			if (filePath) text += ` ${linkToolPath(theme.fg("accent", filePath), filePath, cwd)}`;
			else text += ` ${theme.fg("toolOutput", "...")}`;
			const counts = Array.isArray(args?.edits) ? countEditTypes(args.edits) : undefined;
			if (counts && counts.total > 0) {
				text += ` ${theme.fg("dim", `(${counts.total} ${counts.total === 1 ? "edit" : "edits"})`)}`;
			} else if (suffix) {
				text += ` ${theme.fg("dim", suffix)}`;
			}
			text = clampLineToWidth(text, context.width);
			// Once execution has started, the pending preview's only job is done:
			// renderResult will carry the story ("↳ edited +N -M" with the same
			// expandable diff). Keeping the "↳ pending edit" sub-line and its
			// preview alongside the final result is just duplicate noise.
			if (context.executionStarted) {
				const textComponent = (context.lastComponent && !(context.lastComponent instanceof DiffPreviewComponent))
					? context.lastComponent
					: new Text("", 0, 0);
				textComponent.setText(text);
				return textComponent;
			}
			const previewKey = buildEditPreviewKey(args ?? {});
			const preview = resolvePendingDiffPreview(
				context,
				EDIT_PENDING_PREVIEW_STATE_KEY,
				previewKey,
				() => buildPendingEditPreviewData(args ?? {}, context.cwd ?? process.cwd()),
			);
			const expanded = !!context.expanded || resolveEditDiffDisplay() === "expanded";
			const preview2 = pendingPreviewLines(text, preview, expanded);
			if (preview2.diffData) {
				const diffComponent = context.lastComponent instanceof DiffPreviewComponent
					? context.lastComponent
					: new DiffPreviewComponent({ prefixLines: preview2.lines, diffData: preview2.diffData, theme, expanded: true });
				diffComponent.update({ prefixLines: preview2.lines, diffData: preview2.diffData, theme, expanded: true });
				return diffComponent;
			}
			const textComponent = (context.lastComponent && !(context.lastComponent instanceof DiffPreviewComponent))
				? context.lastComponent
				: new Text("", 0, 0);
			textComponent.setText(clampLinesToWidth(preview2.lines, context.width).join("\n"));
			return textComponent;
		},
			renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; lastComponent?: any; width?: number } =
				rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;

			if (isPartial) {
				const width = (context as any).width ?? (options as any)?.width;
				return new Text(clampLinesToWidth([summaryLine("pending edit")], width).join("\n"), 0, 0);
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
			const semanticClassification = (ptcValue as any)?.semanticSummary?.classification as string | undefined;

			const info = formatEditResultText({
				isError: isError || !!result.isError,
				diff,
				warnings,
				noopEdits,
				errorText: textContent,
				semanticClassification: semanticClassification as any,
			});

			const expanded = isRendererExpanded(options as any, context as any) || resolveEditDiffDisplay() === "expanded";
			const width = (context as any).width ?? (options as any)?.width;
			const diffData = (details as any).diffData;
			const stats = diffData?.stats ?? { added: 0, removed: 0 };
			let text = "";

			if (info.noOp) {
				text = summaryLine("no-op");
				if (expanded && info.errorText) text += `\n${theme.fg("error", info.errorText)}`;
			} else if (info.errorText) {
				const firstLine = info.errorText.split("\n")[0] || "Error";
				text = summaryLine(expanded ? info.errorText : firstLine);
			} else {
				const badges: string[] = [`edited +${stats.added} -${stats.removed}`];
				if (info.semanticBadge) badges.push(info.semanticBadge.replace(/^✓\s*/, ""));
				if (info.warningsBadge) badges.push(info.warningsBadge);
				text = summaryLine(badges.join(" • "), { hidden: !!diffData && !expanded });
				if (expanded && diffData) {
					const diffComponent = context.lastComponent instanceof DiffPreviewComponent
						? context.lastComponent
						: new DiffPreviewComponent({ prefixLines: text.split("\n"), diffData, theme, expanded: true });
					diffComponent.update({ prefixLines: text.split("\n"), diffData, theme, expanded: true });
					return diffComponent;
				}
			}
			return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

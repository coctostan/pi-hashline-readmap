import { withFileMutationQueue, type ExtensionAPI, type EditToolDetails, type ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Static } from "typebox";
import { withLegacyObjectOrder } from "./typebox-schema-order.js";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { readFile as fsReadFile } from "fs/promises";
import { createPatch } from "diff";
import { detectLineEnding, generateCompactOrFullDiff, normalizeToLF, replaceText, restoreLineEndings, stripBom } from "./edit-diff.js";
import {
	HashlineMismatchError,
	HashlineOverlapError,
	applyHashlineEdits,
	computeLineHash,
	ensureHashInit,
	parseLineRef,
	type HashlineEditItem,
	escapeControlCharsForDisplay,
} from "./hashline.js";
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
import { replaceSymbol, type ReplaceSymbolResult } from "./replace-symbol.js";
import { buildEditPreviewKey, buildPendingEditPreviewData, resolvePendingDiffPreview, type PendingDiffPreviewResult } from "./pending-diff-preview.js";
import { buildDiffData, type DiffBlockRange } from "./diff-data.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, linkToolPath, summaryLine } from "./tui-render-utils.js";
import { DiffPreviewComponent } from "./tui-diff-component.js";
import { buildContextHygieneMetadata, buildFileResource, type ContextHygieneMetadata } from "./context-hygiene.js";
import { resolveEditDiffDisplay } from "./hashline-settings.js";
import { looksLikeBinary } from "./binary-detect.js";

const EDIT_PENDING_PREVIEW_STATE_KEY = "hashline-edit-pending-preview";

function pendingPreviewLines(summary: string, preview: PendingDiffPreviewResult | undefined, expanded: boolean): { lines: string[]; diffData?: ReturnType<typeof buildDiffData>; headerLabel?: string } {
	if (!expanded || !preview || preview.type !== "ok") return { lines: summary.split("\n") };
	const diffData = buildDiffData({
		path: preview.data.filePath,
		oldContent: preview.data.previousContent,
		newContent: preview.data.nextContent,
		diff: preview.data.diff,
	});
	const headerLine = summaryLine(preview.data.headerLabel, { hidden: false });
	return { lines: [summary, headerLine], diffData, headerLabel: preview.data.headerLabel };
}

export function wrapWriteError(err: any, path: string): Error {
	const code = err?.code;
	if (code === "EACCES" || code === "EPERM") {
		return new Error(`Permission denied: ${path}`);
	}
	return new Error(`Failed to write file: ${path}`);
}

export function isBinaryBuffer(buf: Buffer): boolean {
	return looksLikeBinary(buf);
}

// ─── Schema ─────────────────────────────────────────────────────────────

const hashlineEditItemSchema = Type.Union([
	withLegacyObjectOrder(Type.Object({
		set_line: Type.Object({
			anchor: Type.String({ description: "Fresh LINE:HASH anchor" }),
			new_text: Type.String(),
		}),
	}, { additionalProperties: true })),
	withLegacyObjectOrder(Type.Object({
		replace_lines: Type.Object({
			start_anchor: Type.String({ description: "Fresh LINE:HASH start anchor" }),
			end_anchor: Type.String({ description: "Fresh LINE:HASH end anchor" }),
			new_text: Type.String(),
		}),
	}, { additionalProperties: true })),
	withLegacyObjectOrder(Type.Object({
		insert_after: Type.Object({
			anchor: Type.String({ description: "Fresh LINE:HASH anchor" }),
			new_text: Type.String(),
			text: Type.Optional(Type.String()),
		}),
	}, { additionalProperties: true })),
	withLegacyObjectOrder(Type.Object({
		replace: Type.Object({
			old_text: Type.String({ description: "Non-empty exact target text" }),
			new_text: Type.String(),
			all: Type.Optional(Type.Boolean()),
			fuzzy: Type.Optional(Type.Boolean()),
		}),
	}, { additionalProperties: true })),
	withLegacyObjectOrder(Type.Object({
		replace_symbol: Type.Object({
			symbol: Type.String(),
			new_body: Type.String({ description: "Non-blank complete symbol body" }),
		}),
	}, { additionalProperties: true })),
	withLegacyObjectOrder(Type.Object(
		{ old_text: Type.String(), new_text: Type.String() },
		{ additionalProperties: true, description: "Do not use — Wrap as { replace: {old_text, new_text} }." },
	)),
], { description: "Overlaps reject; set_line last wins; safe insert_after ok" });

const hashlineEditSchema = withLegacyObjectOrder(Type.Object(
	{
		path: Type.String({ description: "Existing file path; requires fresh session anchors" }),
		edits: Type.Optional(Type.Array(hashlineEditItemSchema, {
			description: "Non-empty; each item has exactly one supported variant",
		})),
		postEditVerify: Type.Optional(Type.Boolean({
			description: "Verify persisted content after write",
		})),
	},
	{ additionalProperties: true },
));

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

type EditErrorResult = ReturnType<typeof buildEditError>;
type EditItem = NonNullable<HashlineParams["edits"]>[number];
type ReplaceEditItem = { replace: { old_text: string; new_text: string; all?: boolean; fuzzy?: boolean } };
type ReplaceSymbolEditItem = { replace_symbol: { symbol: string; new_body: string } };

type EditPhaseResult<T> = T | EditErrorResult;

function isEditErrorResult(value: unknown): value is EditErrorResult {
	return !!value && typeof value === "object" && (value as { isError?: unknown }).isError === true;
}

interface ValidatedEdits {
	edits: EditItem[];
	anchorEdits: HashlineEditItem[];
	replaceEdits: ReplaceEditItem[];
	replaceSymbolEdits: ReplaceSymbolEditItem[];
	legacyNormalizationWarning?: string;
}

interface LoadedEditSource {
	bom: string;
	originalEnding: ReturnType<typeof detectLineEnding>;
	originalNormalized: string;
}

function validateEdits(input: {
	parsed: HashlineParams;
	rawInput: Record<string, unknown>;
	absolutePath: string;
	signal?: AbortSignal;
}): EditPhaseResult<ValidatedEdits> {
	const { parsed, rawInput, absolutePath, signal } = input;
	const legacyOldText =
		typeof rawInput.oldText === "string"
			? rawInput.oldText
			: typeof rawInput.old_text === "string"
				? rawInput.old_text
				: undefined;
	const legacyNewText =
		typeof rawInput.newText === "string"
			? rawInput.newText
			: typeof rawInput.new_text === "string"
				? rawInput.new_text
				: undefined;
	const hasLegacyInput = legacyOldText !== undefined || legacyNewText !== undefined;

	if (typeof (parsed as { edits?: unknown }).edits === "string") {
		try {
			const reparsed = JSON.parse((parsed as { edits?: unknown }).edits as string);
			if (Array.isArray(reparsed)) {
				(parsed as { edits?: unknown }).edits = reparsed;
				(rawInput as { edits?: unknown }).edits = reparsed;
			}
		} catch {
			// Fall through so the existing validation path reports the error.
		}
	}

	const hasEditsInput = Array.isArray(parsed.edits);
	let edits: EditItem[] = Array.isArray(parsed.edits) ? parsed.edits : [];
	let legacyNormalizationWarning: string | undefined;
	if (!hasEditsInput && hasLegacyInput) {
		if (legacyOldText === undefined || legacyNewText === undefined) {
			return buildEditError(
				absolutePath,
				"invalid-edit-variant",
				"Legacy edit input requires both oldText/newText (or old_text/new_text) when 'edits' is omitted.",
			);
		}
		edits = [{
			replace: {
				old_text: legacyOldText,
				new_text: legacyNewText,
				...(typeof rawInput.all === "boolean" ? { all: rawInput.all } : {}),
			},
		}];
		legacyNormalizationWarning =
			"Legacy top-level oldText/newText input was normalized to edits[0].replace. Prefer the edits[] format.";
	}

	if (!edits.length) {
		return buildEditError(absolutePath, "invalid-edit-variant", "No edits provided.");
	}

	for (let i = 0; i < edits.length; i++) {
		throwIfAborted(signal);
		const edit = edits[i] as Record<string, unknown>;
		if (("old_text" in edit || "new_text" in edit) && !("replace" in edit)) {
			return buildEditError(
				absolutePath,
				"invalid-edit-variant",
				`edits[${i}] has top-level 'old_text'/'new_text'. Use {replace: {old_text, new_text}} or {set_line}, {replace_lines}, {insert_after}.`,
			);
		}
		if ("diff" in edit) {
			return buildEditError(
				absolutePath,
				"invalid-edit-variant",
				`edits[${i}] contains 'diff' from patch mode. Hashline edit expects one of: {set_line}, {replace_lines}, {insert_after}, {replace}.`,
			);
		}
		const variantCount =
			Number("set_line" in edit) +
			Number("replace_lines" in edit) +
			Number("insert_after" in edit) +
			Number("replace" in edit) +
			Number("replace_symbol" in edit);
		if (variantCount !== 1) {
			return buildEditError(
				absolutePath,
				"invalid-edit-variant",
				`edits[${i}] must contain exactly one of: 'set_line', 'replace_lines', 'insert_after', 'replace', 'replace_symbol'. Got: [${Object.keys(edit).join(", ")}].`,
			);
		}
	}

	const anchorEdits = edits.filter(
		(edit): edit is HashlineEditItem => "set_line" in edit || "replace_lines" in edit || "insert_after" in edit,
	);
	const replaceEdits = edits.filter(
		(edit): edit is ReplaceEditItem => "replace" in edit,
	);
	const replaceSymbolEdits = edits.filter(
		(edit): edit is ReplaceSymbolEditItem => "replace_symbol" in edit,
	);
	for (const edit of replaceSymbolEdits) {
		if (!edit.replace_symbol.new_body.trim()) {
			return buildEditError(
				absolutePath,
				"invalid-edit-variant",
				"replace_symbol.new_body must not be empty or whitespace-only.",
			);
		}
	}

	return { edits, anchorEdits, replaceEdits, replaceSymbolEdits, legacyNormalizationWarning };
}

async function loadEditSource(input: {
	absolutePath: string;
	displayPath: string;
	signal?: AbortSignal;
}): Promise<EditPhaseResult<LoadedEditSource>> {
	const { absolutePath, displayPath, signal } = input;
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
			message = `Path is a directory: ${displayPath}`;
			hint = `Use ls(${JSON.stringify(displayPath)}) to inspect directories.`;
		} else if (code === "ENOENT") {
			errCode = "file-not-found";
			message = `File not found: ${displayPath}`;
		} else if (code === "EACCES" || code === "EPERM") {
			errCode = "permission-denied";
			message = `Permission denied: ${displayPath}`;
		} else {
			errCode = "fs-error";
			message = `File not readable: ${displayPath}${err?.message ? ` — ${err.message}` : ""}`;
			errorDetails = { fsCode: code, fsMessage: err?.message };
		}
		return buildEditError(absolutePath, errCode, message, hint, errorDetails);
	}
	if (isBinaryBuffer(rawBuffer)) {
		return buildEditError(absolutePath, "binary-file", `Cannot edit binary file: ${displayPath}`);
	}
	throwIfAborted(signal);
	const raw = rawBuffer.toString("utf-8");
	const { bom, text: content } = stripBom(raw);
	return {
		bom,
		originalEnding: detectLineEnding(content),
		originalNormalized: normalizeToLF(content),
	};
}

type ReplaceSymbolProbe = Extract<ReplaceSymbolResult, { type: "ok" }>;

async function resolveReplaceSymbols(input: {
	absolutePath: string;
	originalNormalized: string;
	replaceSymbolEdits: ReplaceSymbolEditItem[];
}): Promise<EditPhaseResult<ReplaceSymbolProbe[]>> {
	const probes: ReplaceSymbolProbe[] = [];
	for (const edit of input.replaceSymbolEdits) {
		const probe = await replaceSymbol({
			filePath: input.absolutePath,
			content: input.originalNormalized,
			symbol: edit.replace_symbol.symbol,
			newBody: edit.replace_symbol.new_body,
		});
		if (probe.type !== "ok") {
			return buildEditError(input.absolutePath, "invalid-edit-variant", probe.message);
		}
		probes.push(probe);
	}
	return probes;
}

function validateReplaceSymbolOverlaps(input: {
	absolutePath: string;
	probes: ReplaceSymbolProbe[];
	anchorEdits: HashlineEditItem[];
}): EditErrorResult | undefined {
	const ranges = input.probes.map((probe) => probe.range);
	const sortedRanges = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
	for (let i = 1; i < sortedRanges.length; i++) {
		const previous = sortedRanges[i - 1];
		const current = sortedRanges[i];
		if (current.start <= previous.end) {
			return buildEditError(
				input.absolutePath,
				"invalid-edit-variant",
				`replace_symbol ranges overlap or duplicate (lines ${previous.start}-${previous.end} and ${current.start}-${current.end}).`,
			);
		}
	}

	if (ranges.length === 0) return undefined;
	for (const edit of input.anchorEdits) {
		if ("replace_lines" in edit) {
			let startLine: number | undefined;
			let endLine: number | undefined;
			try {
				startLine = parseLineRef(edit.replace_lines.start_anchor).line;
				endLine = parseLineRef(edit.replace_lines.end_anchor).line;
			} catch {
				// Normal anchored-edit validation reports malformed anchors later.
			}
			if (startLine !== undefined && endLine !== undefined) {
				const low = Math.min(startLine, endLine);
				const high = Math.max(startLine, endLine);
				for (const range of ranges) {
					if (low <= range.end && high >= range.start) {
						return buildEditError(
							input.absolutePath,
							"invalid-edit-variant",
							`replace_lines range ${low}-${high} overlaps a replace_symbol range (lines ${range.start}-${range.end}).`,
						);
					}
				}
			}
		}

		const refs: string[] = [];
		if ("set_line" in edit) refs.push(edit.set_line.anchor);
		else if ("replace_lines" in edit) refs.push(edit.replace_lines.start_anchor, edit.replace_lines.end_anchor);
		else if ("insert_after" in edit) refs.push(edit.insert_after.anchor);
		for (const ref of refs) {
			let line: number | undefined;
			try {
				line = parseLineRef(ref).line;
			} catch {
				continue;
			}
			for (const range of ranges) {
				if (line >= range.start && line <= range.end) {
					return buildEditError(
						input.absolutePath,
						"invalid-edit-variant",
						`Anchor at line ${line} falls inside a replace_symbol range (lines ${range.start}-${range.end}).`,
					);
				}
			}
		}
	}
	return undefined;
}

function applyResolvedReplaceSymbols(
	originalNormalized: string,
	probes: ReplaceSymbolProbe[],
): { content: string; warnings: string[] } {
	if (probes.length === 0) return { content: originalNormalized, warnings: [] };
	const lines = originalNormalized.split("\n");
	const warnings = probes.flatMap((probe) => probe.warnings);
	for (const probe of [...probes].sort((a, b) => b.range.start - a.range.start)) {
		lines.splice(
			probe.range.start - 1,
			probe.range.end - probe.range.start + 1,
			...probe.replacement.split("\n"),
		);
	}
	return { content: lines.join("\n"), warnings };
}

type AnchorEditResult = ReturnType<typeof applyHashlineEdits>;

function applyAnchorEdits(input: {
	absolutePath: string;
	content: string;
	anchorEdits: HashlineEditItem[];
	signal?: AbortSignal;
}): EditPhaseResult<AnchorEditResult> {
	try {
		return applyHashlineEdits(input.content, input.anchorEdits, input.signal);
	} catch (err) {
		if (err instanceof HashlineMismatchError) {
			return buildEditError(input.absolutePath, "hash-mismatch", err.message, undefined, {
				updatedAnchors: err.updatedAnchors,
			});
		}
		if (err instanceof HashlineOverlapError) {
			return buildEditError(input.absolutePath, "overlapping-edit", err.message);
		}
		throw err;
	}
}

function applyReplaceEdits(input: {
	absolutePath: string;
	displayPath: string;
	content: string;
	replaceEdits: ReplaceEditItem[];
	signal?: AbortSignal;
}): EditPhaseResult<{ content: string; warnings: string[] }> {
	let content = input.content;
	const warnings: string[] = [];
	for (const edit of input.replaceEdits) {
		throwIfAborted(input.signal);
		if (!edit.replace.old_text.length) {
			return buildEditError(input.absolutePath, "invalid-edit-variant", "replace.old_text must not be empty.");
		}
		const replacement = replaceText(content, edit.replace.old_text, edit.replace.new_text, {
			all: edit.replace.all ?? false,
			fuzzy: edit.replace.fuzzy ?? false,
		});
		if (!replacement.count) {
			const message = `Could not find exact text to replace in ${input.displayPath}.`;
			const hint =
				"Re-read the file and prefer set_line/replace_lines/insert_after for hash-verified edits. " +
				"The replace variant is exact-only by default because fuzzy fallback is unverified.";
			return buildEditError(input.absolutePath, "text-not-found", message, hint);
		}
		if (replacement.usedFuzzyMatch) {
			warnings.push(
				"replace used fuzzy matching because exact old_text was not found; re-read the file and prefer set_line/replace_lines/insert_after for hash-verified edits.",
			);
		}
		content = replacement.content;
	}
	return { content, warnings };
}

function detectNoop(input: {
	absolutePath: string;
	displayPath: string;
	originalNormalized: string;
	result: string;
	edits: EditItem[];
	anchorResult: AnchorEditResult;
}): EditErrorResult | undefined {
	if (input.originalNormalized !== input.result) return undefined;
	let diagnostic = `No changes made to ${input.displayPath}. The edits produced identical content.`;
	if (input.anchorResult.noopEdits?.length) {
		diagnostic +=
			"\n" +
			input.anchorResult.noopEdits
				.map(
					(edit) =>
						`Edit ${edit.editIndex}: replacement for ${edit.loc} is identical to current content:\n  ${edit.loc}| ${escapeControlCharsForDisplay(edit.currentContent)}`,
				)
				.join("\n");
		diagnostic += "\nRe-read the file to see the current state.";
	} else {
		const lines = input.result.split("\n");
		const targetLines: string[] = [];
		for (const edit of input.edits) {
			const refs: string[] = [];
			if ("set_line" in edit) refs.push(edit.set_line.anchor);
			else if ("replace_lines" in edit) refs.push(edit.replace_lines.start_anchor, edit.replace_lines.end_anchor);
			else if ("insert_after" in edit) refs.push(edit.insert_after.anchor);
			for (const ref of refs) {
				try {
					const parsed = parseLineRef(ref);
					if (parsed.line >= 1 && parsed.line <= lines.length) {
						const lineContent = lines[parsed.line - 1];
						const hash = computeLineHash(parsed.line, lineContent);
						targetLines.push(`${parsed.line}:${hash}|${escapeControlCharsForDisplay(lineContent)}`);
					}
				} catch {
					// Skip malformed refs; anchored validation already handles them.
				}
			}
		}
		if (targetLines.length > 0) {
			const preview = [...new Set(targetLines)].slice(0, 5).join("\n");
			diagnostic += `\nThe file currently contains:\n${preview}\nYour edits were normalized back to the original content. Ensure your replacement changes actual code, not just formatting.`;
		}
	}
	return buildEditError(input.absolutePath, "no-op", diagnostic);
}

export interface EditToolOptions {
	wasReadInSession?: (absolutePath: string) => boolean;
	syntaxValidate?: SyntaxValidateOptions["syntaxValidate"];
}

async function validateEditSyntax(input: {
	absolutePath: string;
	originalNormalized: string;
	result: string;
	syntaxValidate: EditToolOptions["syntaxValidate"];
}): Promise<EditPhaseResult<{ warning?: string }>> {
	const syntaxMode = resolveSyntaxValidateMode({ syntaxValidate: input.syntaxValidate });
	if (syntaxMode === "off") return {};
	const regression = await validateSyntaxRegression({
		filePath: input.absolutePath,
		before: input.originalNormalized,
		after: input.result,
	});
	if (!regression) return {};
	const message = `syntax-regression: lines ${regression.errorLines.join(", ")}`;
	if (syntaxMode === "block") {
		return buildEditError(input.absolutePath, "syntax-regression", message);
	}
	return { warning: message };
}

async function finalizeWrite(input: {
	absolutePath: string;
	displayPath: string;
	result: string;
	bom: string;
	originalEnding: ReturnType<typeof detectLineEnding>;
	postEditVerify: boolean;
}): Promise<EditPhaseResult<{ writeContent: string }>> {
	const writeContent = input.bom + restoreLineEndings(input.result, input.originalEnding);
	try {
		await writeFileAtomically(input.absolutePath, writeContent);
	} catch (err: any) {
		const wrapped = wrapWriteError(err, input.displayPath);
		const code =
			err?.code === "EACCES" || err?.code === "EPERM"
				? "permission-denied"
				: err?.code === "ENOENT"
					? "file-not-found"
					: "fs-error";
		const message = code === "fs-error" && err?.message ? `${wrapped.message} — ${err.message}` : wrapped.message;
		return buildEditError(
			input.absolutePath,
			code,
			message,
			undefined,
			code === "fs-error" ? { fsCode: err?.code, fsMessage: err?.message } : undefined,
		);
	}

	if (!input.postEditVerify) return { writeContent };
	const contextHygiene = buildContextHygieneMetadata({
		tool: "edit",
		classification: "mutation",
		resources: [buildFileResource(input.absolutePath)],
	});
	let verifiedContent: string;
	try {
		verifiedContent = await fsReadFile(input.absolutePath, "utf-8");
	} catch (err: any) {
		return buildEditError(
			input.absolutePath,
			"post-edit-verification-read-failed",
			`Edit write completed but post-edit verification failed: could not read ${input.displayPath} after writing.`,
			undefined,
			{ fsCode: err?.code, fsMessage: err?.message },
			contextHygiene,
		);
	}
	if (verifiedContent !== writeContent) {
		return buildEditError(
			input.absolutePath,
			"post-edit-verification-mismatch",
			`Edit write completed but post-edit verification did not confirm the intended content for ${input.displayPath}. Re-read the file before making follow-up edits.`,
			undefined,
			{ expectedLength: writeContent.length, actualLength: verifiedContent.length },
			contextHygiene,
		);
	}
	return { writeContent };
}

type EditSuccessResult = {
	content: Array<{ type: "text"; text: string }>;
	details: EditToolDetails & {
		diffData: ReturnType<typeof buildDiffData>;
		ptcValue: ReturnType<typeof buildEditOutput>["ptcValue"];
		contextHygiene: ContextHygieneMetadata;
	};
};

async function buildEditResult(input: {
	absolutePath: string;
	displayPath: string;
	originalNormalized: string;
	result: string;
	probes: ReplaceSymbolProbe[];
	anchorResult: AnchorEditResult;
	edits: EditItem[];
	legacyNormalizationWarning?: string;
	replaceWarnings: string[];
	replaceSymbolWarnings: string[];
	syntaxWarning?: string;
}): Promise<EditSuccessResult> {
	const diffResult = generateCompactOrFullDiff(input.originalNormalized, input.result);
	const patch = createPatch(input.displayPath, input.originalNormalized, input.result);
	const blockRanges: DiffBlockRange[] = input.probes.map((probe) => ({
		kind: "remove" as const,
		startLine: probe.range.start,
		endLine: probe.range.end,
	}));
	const diffData = buildDiffData({
		path: input.absolutePath,
		oldContent: input.originalNormalized,
		newContent: input.result,
		diff: diffResult.diff,
		...(blockRanges.length ? { blockRanges } : {}),
	});
	const warnings: string[] = [];
	if (input.anchorResult.warnings?.length) warnings.push(...input.anchorResult.warnings);
	if (input.legacyNormalizationWarning) warnings.push(input.legacyNormalizationWarning);
	if (input.replaceWarnings.length) warnings.push(...input.replaceWarnings);
	if (input.replaceSymbolWarnings.length) warnings.push(...input.replaceSymbolWarnings);
	if (input.syntaxWarning) warnings.push(input.syntaxWarning);

	const internalClassification = classifyEdit(input.originalNormalized, input.result);
	const difftAvailable = await isDifftAvailable();
	let semanticSummary: SemanticSummary = {
		classification: internalClassification.classification,
		difftasticAvailable: difftAvailable,
	};
	if (difftAvailable) {
		const extension = input.displayPath.split(".").pop() ?? "txt";
		const difftResult = await runDifftastic(input.originalNormalized, input.result, extension);
		if (difftResult) {
			semanticSummary = {
				classification: difftResult.classification,
				difftasticAvailable: true,
				...(difftResult.movedBlocks > 0 ? { movedBlocks: difftResult.movedBlocks } : {}),
			};
		}
	}

	const builtOutput = buildEditOutput({
		path: input.absolutePath,
		displayPath: input.displayPath,
		diff: diffResult.diff,
		patch,
		diffData,
		firstChangedLine: input.anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
		warnings,
		noopEdits: input.anchorResult.noopEdits ?? [],
		edits: input.edits,
		semanticSummary,
	});
	return {
		content: [{ type: "text", text: builtOutput.text }],
		details: {
			diff: diffResult.diff,
			patch: builtOutput.patch,
			diffData,
			firstChangedLine: input.anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
			ptcValue: builtOutput.ptcValue,
			contextHygiene: builtOutput.contextHygiene,
		} as EditSuccessResult["details"],
	};
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

					const validated = validateEdits({ parsed, rawInput: input, absolutePath, signal });
					if (isEditErrorResult(validated)) return validated;
					const { edits, anchorEdits, replaceEdits, replaceSymbolEdits, legacyNormalizationWarning } = validated;

					const loaded = await loadEditSource({ absolutePath, displayPath: path, signal });
					if (isEditErrorResult(loaded)) return loaded;
					const { bom, originalEnding, originalNormalized } = loaded;

					const resolvedSymbols = await resolveReplaceSymbols({
						absolutePath,
						originalNormalized,
						replaceSymbolEdits,
					});
					if (isEditErrorResult(resolvedSymbols)) return resolvedSymbols;

					const symbolOverlapError = validateReplaceSymbolOverlaps({
						absolutePath,
						probes: resolvedSymbols,
						anchorEdits,
					});
					if (symbolOverlapError) return symbolOverlapError;

					const symbolApplication = applyResolvedReplaceSymbols(originalNormalized, resolvedSymbols);
					const rsProbeResults = resolvedSymbols;
					const replaceSymbolWarnings = symbolApplication.warnings;
					let result = symbolApplication.content;

					const anchorResult = applyAnchorEdits({ absolutePath, content: result, anchorEdits, signal });
					if (isEditErrorResult(anchorResult)) return anchorResult;
					result = anchorResult.content;

					const replacementResult = applyReplaceEdits({
						absolutePath,
						displayPath: path,
						content: result,
						replaceEdits,
						signal,
					});
					if (isEditErrorResult(replacementResult)) return replacementResult;
					result = replacementResult.content;
					const replaceWarnings = replacementResult.warnings;

					const noopError = detectNoop({
						absolutePath,
						displayPath: path,
						originalNormalized,
						result,
						edits,
						anchorResult,
					});
					if (noopError) return noopError;

					throwIfAborted(signal);

					const syntaxResult = await validateEditSyntax({
						absolutePath,
						originalNormalized,
						result,
						syntaxValidate: options.syntaxValidate,
					});
					if (isEditErrorResult(syntaxResult)) return syntaxResult;
					const syntaxWarning = syntaxResult.warning;

					const writeResult = await finalizeWrite({
						absolutePath,
						displayPath: path,
						result,
						bom,
						originalEnding,
						postEditVerify: input.postEditVerify === true,
					});
					if (isEditErrorResult(writeResult)) return writeResult;

					return await buildEditResult({
						absolutePath,
						displayPath: path,
						originalNormalized,
						result,
						probes: rsProbeResults,
						anchorResult,
						edits,
						legacyNormalizationWarning,
						replaceWarnings,
						replaceSymbolWarnings,
						syntaxWarning,
					});
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
			const contextExpanded = !!context.expanded;
			const settingExpanded = resolveEditDiffDisplay() === "expanded";
			const expanded = contextExpanded || settingExpanded;
			const argsStable = context.argsComplete === true;
			const previewEligible = expanded && argsStable;
			const previewKey = previewEligible ? buildEditPreviewKey(args ?? {}) : undefined;
			const preview = previewEligible
				? resolvePendingDiffPreview(
					context,
					EDIT_PENDING_PREVIEW_STATE_KEY,
					previewKey,
					() => buildPendingEditPreviewData(args ?? {}, context.cwd ?? process.cwd()),
				)
				: undefined;
			const preview2: ReturnType<typeof pendingPreviewLines> = !expanded && argsStable
				? { lines: [text, summaryLine("pending edit", { hidden: true })], headerLabel: "pending edit" }
				: pendingPreviewLines(text, preview, expanded);
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

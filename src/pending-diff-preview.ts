import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { generateDiffString, normalizeToLF, replaceText } from "./edit-diff.js";
import { applyHashlineEdits, type HashlineEditItem } from "./hashline.js";
import { replaceSymbol } from "./replace-symbol.js";

export const PENDING_DIFF_MAX_BYTES = 1024 * 1024;
export const PENDING_DIFF_MAX_LINE_CELLS = 1_000_000;

export interface PendingDiffPreviewData {
	filePath: string;
	previousContent: string;
	nextContent: string;
	fileExistedBeforeWrite: boolean;
	headerLabel: "pending edit" | "pending overwrite" | "pending create";
	diff: string;
}

export type PendingDiffPreviewResult =
	| { type: "ok"; data: PendingDiffPreviewData }
	| { type: "skip"; reason: string };

function skip(reason: string): PendingDiffPreviewResult {
	return { type: "skip", reason };
}

function isInsidePath(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep) && !resolve(rel).startsWith(".." + sep));
}

function resolveWorkspacePreviewPath(rawPath: unknown, cwd: string, allowMissing: boolean): { type: "ok"; path: string; existed: boolean } | { type: "skip"; reason: string } {
	if (typeof rawPath !== "string" || rawPath.trim() === "") return { type: "skip", reason: "missing path" };
	const workspace = realpathSync(cwd);
	const normalizedPath = rawPath.replace(/^@/, "");
	const explicitAbsolute = isAbsolute(normalizedPath);
	const requested = resolve(workspace, normalizedPath);
	if (existsSync(requested)) {
		const realTarget = realpathSync(requested);
		if (!explicitAbsolute && !isInsidePath(workspace, realTarget)) return { type: "skip", reason: "path outside workspace" };
		return { type: "ok", path: realTarget, existed: true };
	}

	if (!explicitAbsolute && !isInsidePath(workspace, requested)) return { type: "skip", reason: "path outside workspace" };

	if (!allowMissing) return { type: "skip", reason: "file not found" };
	const parent = dirname(requested);
	if (!existsSync(parent)) return { type: "skip", reason: "parent directory not found" };
	return { type: "ok", path: requested, existed: false };
}

function readUtf8File(filePath: string): { type: "ok"; content: string } | { type: "skip"; reason: string } {
	const stat = statSync(filePath);
	if (!stat.isFile()) return { type: "skip", reason: "not a file" };
	if (stat.size > PENDING_DIFF_MAX_BYTES) return { type: "skip", reason: "file too large" };
	const content = readFileSync(filePath, "utf-8");
	if (content.includes("\0")) return { type: "skip", reason: "binary file" };
	return { type: "ok", content };
}

function countPreviewLines(content: string): number {
	if (content.length === 0) return 0;
	let lines = 1;
	for (let index = 0; index < content.length; index++) {
		if (content.charCodeAt(index) === 10) lines++;
	}
	return lines;
}

function pendingDiffTooComplex(previousContent: string, nextContent: string): boolean {
	return countPreviewLines(previousContent) * countPreviewLines(nextContent) > PENDING_DIFF_MAX_LINE_CELLS;
}

function buildData(
	filePath: string,
	previousContent: string,
	nextContent: string,
	existed: boolean,
	headerLabel: PendingDiffPreviewData["headerLabel"],
): PendingDiffPreviewResult {
	const diff = generateDiffString(normalizeToLF(previousContent), normalizeToLF(nextContent)).diff;
	return {
		type: "ok",
		data: {
			filePath,
			previousContent,
			nextContent,
			fileExistedBeforeWrite: existed,
			headerLabel,
			diff,
		},
	};
}

type ReplaceEdit = { replace: { old_text: string; new_text: string; all?: boolean; fuzzy?: boolean } };
type PendingEditInput = { path?: unknown; edits?: unknown[]; oldText?: unknown; newText?: unknown; old_text?: unknown; new_text?: unknown };

function normalizeReplaceOnlyEdits(input: PendingEditInput): unknown[] {
	if (Array.isArray(input.edits)) return input.edits;
	const oldText = typeof input.oldText === "string" ? input.oldText : typeof input.old_text === "string" ? input.old_text : undefined;
	const newText = typeof input.newText === "string" ? input.newText : typeof input.new_text === "string" ? input.new_text : undefined;
	if (oldText === undefined || newText === undefined) return [];
	return [{ replace: { old_text: oldText, new_text: newText } }];
}

function isReplaceEdit(edit: unknown): edit is ReplaceEdit {
	return !!edit && typeof edit === "object" && "replace" in edit && typeof (edit as any).replace?.old_text === "string" && typeof (edit as any).replace?.new_text === "string";
}

type AnchorEdit =
	| { set_line: { anchor: string; new_text: string } }
	| { replace_lines: { start_anchor: string; end_anchor: string; new_text: string } }
	| { insert_after: { anchor: string; new_text: string; text?: string } };

function isAnchorEdit(edit: unknown): edit is AnchorEdit {
	return !!edit && typeof edit === "object" && ("set_line" in edit || "replace_lines" in edit || "insert_after" in edit);
}

function applyAnchoredPreview(content: string, edits: AnchorEdit[]): { type: "ok"; content: string } | { type: "skip"; reason: string } {
	try {
		return { type: "ok", content: applyHashlineEdits(content, edits as HashlineEditItem[]).content };
	} catch (err: any) {
		return { type: "skip", reason: `anchor projection failed: ${err?.message ?? String(err)}` };
	}
}

type ReplaceSymbolEdit = { replace_symbol: { symbol: string; new_body: string } };

function isReplaceSymbolEdit(edit: unknown): edit is ReplaceSymbolEdit {
	return !!edit && typeof edit === "object" && "replace_symbol" in edit && typeof (edit as any).replace_symbol?.symbol === "string" && typeof (edit as any).replace_symbol?.new_body === "string";
}

async function applyReplaceSymbolPreview(filePath: string, content: string, edit: ReplaceSymbolEdit): Promise<{ type: "ok"; content: string } | { type: "skip"; reason: string }> {
	try {
		if (!edit.replace_symbol.new_body.trim()) return { type: "skip", reason: "replace_symbol new_body is empty" };
		const probe = await replaceSymbol({
			filePath,
			content,
			symbol: edit.replace_symbol.symbol,
			newBody: edit.replace_symbol.new_body,
		});
		if (probe.type !== "ok") return { type: "skip", reason: `symbol projection failed: ${probe.message}` };
		return { type: "ok", content: probe.content };
	} catch (err: any) {
		return { type: "skip", reason: `symbol projection failed: ${err?.message ?? String(err)}` };
	}
}


function applyReplacePreview(content: string, edit: ReplaceEdit): { type: "ok"; content: string } | { type: "skip"; reason: string } {
	const { old_text, new_text } = edit.replace;
	if (!old_text.length) return { type: "skip", reason: "replace old_text is empty" };
	const replacement = replaceText(content, old_text, new_text, {
		all: edit.replace.all ?? false,
		fuzzy: edit.replace.fuzzy ?? false,
	});
	if (!replacement.count) return { type: "skip", reason: "replace old_text was not found" };
	return { type: "ok", content: replacement.content };
}

export function buildPendingWritePreviewData(input: { path?: unknown; content?: unknown }, cwd: string): PendingDiffPreviewResult {
	if (typeof input.content !== "string") return skip("missing content");
	if (Buffer.byteLength(input.content, "utf8") > PENDING_DIFF_MAX_BYTES) return skip("content too large");
	const resolved = resolveWorkspacePreviewPath(input.path, cwd, true);
	if (resolved.type === "skip") return resolved;
	if (!resolved.existed) {
		return {
			type: "ok",
			data: {
				filePath: resolved.path,
				previousContent: "",
				nextContent: input.content,
				fileExistedBeforeWrite: false,
				headerLabel: "pending create",
				diff: "",
			},
		};
	}
	const previous = readUtf8File(resolved.path);
	if (previous.type === "skip") return previous;
	if (pendingDiffTooComplex(previous.content, input.content)) return skip("diff too complex");
	return buildData(resolved.path, previous.content, input.content, true, "pending overwrite");
}

export async function buildPendingEditPreviewData(input: PendingEditInput, cwd: string): Promise<PendingDiffPreviewResult> {
	const edits = normalizeReplaceOnlyEdits(input);
	if (edits.length === 0) return skip("missing edits");
	const resolved = resolveWorkspacePreviewPath(input.path, cwd, false);
	if (resolved.type === "skip") return resolved;
	const previous = readUtf8File(resolved.path);
	if (previous.type === "skip") return previous;
	let next = normalizeToLF(previous.content);
	const anchorBatch: AnchorEdit[] = [];

	for (const edit of edits) {
		if (isReplaceEdit(edit)) {
			if (anchorBatch.length > 0) {
				const anchored = applyAnchoredPreview(next, anchorBatch);
				if (anchored.type === "skip") return anchored;
				next = anchored.content;
				anchorBatch.length = 0;
			}
			const projected = applyReplacePreview(next, edit);
			if (projected.type === "skip") return projected;
			next = projected.content;
			continue;
		}
		if (isAnchorEdit(edit)) {
			anchorBatch.push(edit);
			continue;
		}
		if (isReplaceSymbolEdit(edit)) {
			if (anchorBatch.length > 0) {
				const anchored = applyAnchoredPreview(next, anchorBatch);
				if (anchored.type === "skip") return anchored;
				next = anchored.content;
				anchorBatch.length = 0;
			}
			const projected = await applyReplaceSymbolPreview(resolved.path, next, edit);
			if (projected.type === "skip") return projected;
			next = projected.content;
			continue;
		}
		return skip("unsupported edit variant");
	}

	if (anchorBatch.length > 0) {
		const anchored = applyAnchoredPreview(next, anchorBatch);
		if (anchored.type === "skip") return anchored;
		next = anchored.content;
	}
	if (pendingDiffTooComplex(previous.content, next)) return skip("diff too complex");
	return buildData(resolved.path, previous.content, next, true, "pending edit");
}

export interface PendingDiffPreviewCacheSlot<T = PendingDiffPreviewResult> {
	key?: string;
	data?: T;
	pending?: boolean;
}

export function buildEditPreviewKey(input: PendingEditInput): string | undefined {
	if (typeof input.path !== "string") return undefined;
	const edits = normalizeReplaceOnlyEdits(input);
	if (edits.length === 0) return undefined;
	return JSON.stringify({ path: input.path, edits });
}

export function buildWritePreviewKey(input: { path?: unknown; content?: unknown }): string | undefined {
	if (typeof input.path !== "string" || typeof input.content !== "string") return undefined;
	return JSON.stringify({ path: input.path, content: input.content });
}

export function resolvePendingDiffPreview<T extends PendingDiffPreviewResult>(
	context: { state?: Record<string, PendingDiffPreviewCacheSlot<T>>; invalidate?: () => void } | undefined,
	stateKey: string,
	previewKey: string | undefined,
	compute: () => T | Promise<T>,
): T | undefined {
	if (!previewKey) return undefined;
	const root = context?.state;
	if (!root) return undefined;
	const slot = (root[stateKey] ??= {} as PendingDiffPreviewCacheSlot<T>);
	if (slot.key !== previewKey) {
		slot.key = previewKey;
		slot.data = undefined;
		slot.pending = false;
	}
	if (slot.data !== undefined) return slot.data;
	if (slot.pending) return undefined;

	let value: T | Promise<T>;
	try {
		value = compute();
	} catch (err: any) {
		const skipped = { type: "skip", reason: `projection failed: ${err?.message ?? String(err)}` } as T;
		slot.data = skipped;
		return skipped;
	}
	if (value && typeof (value as any).then === "function") {
		slot.pending = true;
		void (value as Promise<T>).then((resolved) => {
			if (slot.key !== previewKey) return;
			slot.data = resolved;
			slot.pending = false;
			context?.invalidate?.();
		}).catch((err: any) => {
			if (slot.key !== previewKey) return;
			slot.data = { type: "skip", reason: `projection failed: ${err?.message ?? String(err)}` } as T;
			slot.pending = false;
			context?.invalidate?.();
		});
		return undefined;
	}

	slot.data = value as T;
	return slot.data;
}

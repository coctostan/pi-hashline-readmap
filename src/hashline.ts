/**
 * Hashline engine — hash-anchored line editing.
 *
 * Vendored & adapted from oh-my-pi (MIT, github.com/can1357/oh-my-pi).
 * Key additions ported: merge detection, confusable hyphens, restoreOldWrappedLines.
 */

import { diffArrays } from "diff";
import xxhashWasm from "xxhash-wasm";
import { throwIfAborted } from "./runtime.js";
import type { PtcLine } from "./ptc-value.js";

// ─── Types ──────────────────────────────────────────────────────────────

export type HashlineEditItem =
	| { set_line: { anchor: string; new_text: string } }
	| { replace_lines: { start_anchor: string; end_anchor: string; new_text: string } }
	| { insert_after: { anchor: string; new_text: string; text?: string } }
	| { copy_lines: { start_anchor: string; end_anchor: string; after_anchor: string; from_path?: string } }
	| { move_lines: { start_anchor: string; end_anchor: string; after_anchor: string; from_path?: string } }
	| { replace: { old_text: string; new_text: string; all?: boolean } };

/** Content of other files that `copy_lines.from_path` names, keyed by that exact string (LF-normalized). */
export interface HashlineEditOptions {
	sources?: ReadonlyMap<string, string>;
	/** Observe validated, resolved row mutations without changing logical anchor semantics. */
	onSplice?: (index: number, deleteCount: number, newLines: readonly string[], copy?: { fromPath?: string; startLine: number }) => void;
}

interface HashMismatch {
	line: number;
	expected: string;
	actual: string;
	expectedContent?: string;
}

export class HashlineMismatchError extends Error {
	readonly updatedAnchors: PtcLine[];

	constructor(message: string, updatedAnchors: PtcLine[]) {
		super(message);
		this.name = "HashlineMismatchError";
		this.updatedAnchors = updatedAnchors;
	}
}

export class HashlineOverlapError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HashlineOverlapError";
	}
}

type ParsedRef = { line: number; hash: string; content?: string };

type ParsedSpec =
	| { kind: "single"; ref: ParsedRef }
	| { kind: "range"; start: ParsedRef; end: ParsedRef }
	| { kind: "insertAfter"; after: ParsedRef };

interface ParsedEdit {
	spec: ParsedSpec;
	dstLines: string[];
	/** Lines copied verbatim from a source range; resolved after validation, never echo-stripped. */
	copy?: { start: ParsedRef; end: ParsedRef; fromPath?: string };
}

type IndexedParsedEdit = ParsedEdit & { idx: number };

interface NoopEdit {
	editIndex: number;
	loc: string;
	currentContent: string;
}

// ─── Hash computation ───────────────────────────────────────────────────

const HASH_LEN = 3;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN;
const DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));

const HASHLINE_PREFIX_RE = /^\d+:[0-9a-zA-Z]{1,16}\|/;
const DIFF_PLUS_RE = /^\+(?!\+)/;
const HASH_ONLY_PREFIX_RE = /^[0-9a-f]{3}\|/;
const CONFUSABLE_HYPHENS_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;
const HASH_RELOCATION_WINDOW_BASE = 20;
const HASH_RELOCATION_WINDOW_CAP = 100;

interface HashlineGlobalState {
	h32Fn: ((input: string, seed?: number) => number) | null;
	initPromise: Promise<void> | null;
}

const HASHLINE_STATE_KEY = Symbol.for("pi-hashline-readmap.hashlineState.v1");

function getHashlineState(): HashlineGlobalState {
	const globalObject = globalThis as any;
	globalObject[HASHLINE_STATE_KEY] ??= {
		h32Fn: null,
		initPromise: null,
	} satisfies HashlineGlobalState;
	return globalObject[HASHLINE_STATE_KEY] as HashlineGlobalState;
}

export async function ensureHashInit(): Promise<void> {
	const state = getHashlineState();
	if (state.h32Fn) return;
	if (!state.initPromise) {
		state.initPromise = xxhashWasm().then((hasher) => {
			state.h32Fn = hasher.h32;
		});
	}
	await state.initPromise;
}

function xxh32(input: string): number {
	const state = getHashlineState();
	if (!state.h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
	return state.h32Fn(input, 0) >>> 0;
}

/**
 * Hash of one line's exact content. Only a trailing CR is ignored (CRLF files hash like LF files).
 * Whitespace is significant: a reindent or trailing-space change is a content change, so an
 * anchor served before a formatter run no longer verifies and the edit is refused instead of
 * writing back the stale view.
 */
export function computeLineHash(_idx: number, line: string): string {
	if (line.endsWith("\r")) line = line.slice(0, -1);
	return DICT[xxh32(line) % HASH_MOD];
}

/**
 * Lines as tools display them: a trailing newline terminates the last line instead of starting
 * an extra empty one, so `"aaa\nbbb\n"` shows two rows. An empty file shows one empty row, which
 * anchors the first insertion.
 */
export function splitDisplayLines(content: string): string[] {
	const lines = content.split("\n");
	if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

const DISPLAY_CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

export function escapeControlCharsForDisplay(text: string): string {
	return text.replace(DISPLAY_CONTROL_CHAR_RE, (ch) => {
		return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
	});
}

export function formatHashlineDisplay(lineNumber: number, content: string): string {
	return `${lineNumber}:${computeLineHash(lineNumber, content)}|${escapeControlCharsForDisplay(content)}`;
}

export function hashLine(lineNumber: number, content: string): string {
	return formatHashlineDisplay(lineNumber, content);
}

export function hashLines(content: string): string {
	return content
		.split("\n")
		.map((line, i) => formatHashlineDisplay(i + 1, line))
		.join("\n");
}

// ─── Parsing ────────────────────────────────────────────────────────────

const LINE_REF_RE = new RegExp(`^(?:(\\d+):)?([0-9a-fA-F]{${HASH_LEN}})$`);

/**
 * Parse an anchor. Accepts the canonical `LINE:HASH` and the slips models make when copying it:
 * a trailing `|content`, several pasted rows (the first is used), diff or grep markers (`>>>`,
 * `>>`, `+`, `-`), and a bare `HASH` or `HASH|content` without the line number. A missing line
 * number is reported as `line: 0`; the edit resolves it against the current file, by hash and
 * the pasted content, and refuses it unless exactly one line matches.
 */
export function parseLineRef(ref: string): { line: number; hash: string; content?: string } {
	const firstRow = ref.replace(/\r/g, "").split("\n").find((row) => row.trim().length > 0) ?? "";
	const row = firstRow.replace(/^\s*(?:>>>|>>|[+-](?=\s*\d*:?[0-9a-fA-F]{3}\|?))?\s*/, "");
	const pipe = row.indexOf("|");
	const content = pipe >= 0 ? row.slice(pipe + 1) : undefined;
	const head = (pipe >= 0 ? row.slice(0, pipe) : row).replace(/ {2}.*$/, "").trim().replace(/\s*:\s*/, ":");
	const match = head.match(LINE_REF_RE);
	if (!match) throw new Error(`Invalid line reference "${ref}". Expected "LINE:HASH" (e.g. "5:abc").`);
	const line = match[1] === undefined ? 0 : Number.parseInt(match[1], 10);
	if (match[1] !== undefined && line < 1) throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`);
	return { line, hash: match[2].toLowerCase(), content };
}

// ─── Mismatch formatting ────────────────────────────────────────────────

function tokenSimilarity(a: string, b: string): number {
	const tokA = new Set(a.trim().split(/\s+/));
	const tokB = new Set(b.trim().split(/\s+/));
	if (tokA.size === 0 && tokB.size === 0) return 1;
	if (tokA.size === 0 || tokB.size === 0) return 0;
	let overlap = 0;
	for (const t of tokA) {
		if (tokB.has(t)) overlap++;
	}
	return overlap / Math.max(tokA.size, tokB.size);
}

function findSimilarLines(
	expectedContent: string,
	fileLines: string[],
	hintLine: number,
	maxSuggestions: number = 3,
): string[] {
	const SCAN_WINDOW = 50;
	const MIN_SIMILARITY = 0.3;
	const start = Math.max(0, hintLine - 1 - SCAN_WINDOW);
	const end = Math.min(fileLines.length, hintLine - 1 + SCAN_WINDOW + 1);
	const candidates: { line: number; score: number; content: string }[] = [];

	for (let i = start; i < end; i++) {
		const content = fileLines[i];
		if (!content.trim()) continue;
		const score = tokenSimilarity(expectedContent, content);
		if (score >= MIN_SIMILARITY) {
			candidates.push({ line: i + 1, score, content });
		}
	}

	candidates.sort((a, b) => b.score - a.score);
	return candidates.slice(0, maxSuggestions).map((c) => {
		const hash = computeLineHash(c.line, c.content);
		return `  ${c.line}:${hash}|${escapeControlCharsForDisplay(c.content)}`;
	});
}
function formatMismatchError(
	mismatches: HashMismatch[],
	fileLines: string[],
	relocationWindow: number,
): { message: string; updatedAnchors: PtcLine[] } {
	const mismatchSet = new Map<number, HashMismatch>();
	for (const m of mismatches) mismatchSet.set(m.line, m);
	const updatedAnchors: PtcLine[] = mismatches.map((m) => {
		const raw = fileLines[m.line - 1] ?? "";
		const hash = computeLineHash(m.line, raw);
		return {
			line: m.line,
			hash,
			anchor: `${m.line}:${hash}`,
			raw,
			display: escapeControlCharsForDisplay(raw),
		};
	});
	const displayLines = new Set<number>();
	for (const m of mismatches) {
		for (let i = Math.max(1, m.line - 2); i <= Math.min(fileLines.length, m.line + 2); i++) {
			displayLines.add(i);
		}
	}
	const sorted = [...displayLines].sort((a, b) => a - b);
	const out: string[] = [
		"Edit rejected — nothing was written. The anchor hash did not match the current file content.",
		`${mismatches.length} line${mismatches.length > 1 ? "s have" : " has"} changed since last read. Auto-relocation checks only within ±${relocationWindow} lines of each anchor. Use the updated LINE:HASH references shown below (>>> marks changed lines).`,
		"",
	];
	let prev = -1;
	for (const num of sorted) {
		if (prev !== -1 && num > prev + 1) out.push("    ...");
		prev = num;
		const content = fileLines[num - 1];
		const hash = computeLineHash(num, content);
		const prefix = `${num}:${hash}`;
		out.push(
			mismatchSet.has(num)
				? `>>> ${prefix}|${escapeControlCharsForDisplay(content)}`
				: `    ${prefix}|${escapeControlCharsForDisplay(content)}`,
		);
	}
	const withContent = mismatches.filter((m) => m.expectedContent !== undefined);
	if (withContent.length > 0) {
		for (const m of withContent) {
			const suggestions = findSimilarLines(m.expectedContent!, fileLines, m.line);
			if (suggestions.length > 0) {
				out.push("");
				out.push("Did you mean one of these nearby lines?");
				out.push(...suggestions);
			}
		}
	}

	return { message: out.join("\n"), updatedAnchors };
}

// ─── DST preprocessing helpers ──────────────────────────────────────────

function splitDst(dst: string): string[] {
	if (dst === "") return [];
	const normalized = dst.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
	return normalized.split("\n");
}

/**
 * Remove anchor prefixes models paste into replacement text. `LINE:HASH|` prefixes are stripped
 * when they dominate. Bare `HASH|` prefixes are stripped when they dominate a multi-line text, or
 * on a single line when the hash is one this file actually serves (`knownHashes`): a pasted
 * `467|BBB` copied from the `2:467|bbb` row is a slip, while real content rarely starts with
 * three hex digits, a pipe, and a hash of this exact file.
 */
function stripNewLinePrefixes(lines: string[], knownHashes?: ReadonlySet<string>): string[] {
	let hashCount = 0;
	let hashOnlyCount = 0;
	let knownHashOnlyCount = 0;
	let plusCount = 0;
	let nonEmpty = 0;

	for (const l of lines) {
		if (!l.length) continue;
		nonEmpty++;
		if (HASHLINE_PREFIX_RE.test(l)) hashCount++;
		else if (HASH_ONLY_PREFIX_RE.test(l)) {
			hashOnlyCount++;
			if (knownHashes?.has(l.slice(0, HASH_LEN).toLowerCase())) knownHashOnlyCount++;
		}
		if (DIFF_PLUS_RE.test(l)) plusCount++;
	}

	if (!nonEmpty) return lines;
	const stripHash = hashCount > 0 && hashCount >= nonEmpty * 0.5;
	const stripHashOnly =
		!stripHash &&
		hashOnlyCount > 0 &&
		((nonEmpty >= 2 && hashOnlyCount >= nonEmpty * 0.5) || knownHashOnlyCount === nonEmpty);
	const stripPlus = !stripHash && !stripHashOnly && plusCount > 0 && plusCount >= nonEmpty * 0.5;
	if (!stripHash && !stripHashOnly && !stripPlus) return lines;

	return lines.map((l) =>
		stripHash
			? l.replace(HASHLINE_PREFIX_RE, "")
			: stripHashOnly
				? l.replace(HASH_ONLY_PREFIX_RE, "")
				: stripPlus
					? l.replace(DIFF_PLUS_RE, "")
					: l,
	);
}

// ─── Whitespace / format helpers ────────────────────────────────────────

function stripAllWhitespace(s: string): string {
	return s.replace(/\s+/g, "");
}

function stripTrailingContinuationTokens(s: string): string {
	return s.replace(/(?:&&|\|\||\?\?|\?|:|=|,|\+|-|\*|\/|\.|\()\s*$/u, "");
}

function stripMergeOperatorChars(s: string): string {
	return s.replace(/[|&?]/g, "");
}

function normalizeConfusableHyphensInLines(lines: string[]): string[] {
	return lines.map((line) => line.replace(CONFUSABLE_HYPHENS_RE, "-"));
}

function wsEq(a: string, b: string): boolean {
	return a === b || a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

function restoreIndent(tpl: string, line: string): string {
	if (!line.length) return line;
	const indent = tpl.match(/^\s*/)?.[0] ?? "";
	if (!indent.length || (line.match(/^\s*/)?.[0] ?? "").length > 0) return line;
	return indent + line;
}

function restoreIndentPaired(old: string[], next: string[]): string[] {
	if (old.length !== next.length) return next;
	let changed = false;
	const out = next.map((line, i) => {
		const restored = restoreIndent(old[i], line);
		if (restored !== line) changed = true;
		return restored;
	});
	return changed ? out : next;
}

// ─── Echo handling ──────────────────────────────────────────────────────

/** An insertion that starts by repeating its anchor line re-inserts that line; drop the echo. */
function stripInsertAnchorEcho(anchorLine: string, dst: string[]): { lines: string[]; stripped: boolean } {
	if (dst.length > 1 && dst[0] === anchorLine) return { lines: dst.slice(1), stripped: true };
	return { lines: dst, stripped: false };
}

/**
 * Replacements are applied literally, so a replacement that repeats the untouched line above or
 * below its range duplicates that line. That is sometimes intended, so warn instead of guessing.
 */
function describeBoundaryDuplicates(fileLines: string[], start: number, end: number, dst: string[]): string[] {
	if (dst.length === 0) return [];
	const warnings: string[] = [];
	const above = start >= 2 ? fileLines[start - 2] : undefined;
	const below = end < fileLines.length ? fileLines[end] : undefined;
	if (above !== undefined && above.trim().length > 0 && dst[0] === above) {
		warnings.push(
			`Replacement for lines ${start}-${end} starts with a copy of line ${start - 1} above it, so that line now appears twice. If unintended, delete the duplicate.`,
		);
	}
	if (below !== undefined && below.trim().length > 0 && dst[dst.length - 1] === below) {
		warnings.push(
			`Replacement for lines ${start}-${end} ends with a copy of line ${end + 1} below it, so that line now appears twice. If unintended, delete the duplicate.`,
		);
	}
	return warnings;
}

// ─── Edit parser ────────────────────────────────────────────────────────

function parseHashlineEditItem(edit: HashlineEditItem, knownHashes?: ReadonlySet<string>): ParsedEdit {
	if ("set_line" in edit) {
		return {
			spec: { kind: "single", ref: parseLineRef(edit.set_line.anchor) },
			dstLines: stripNewLinePrefixes(splitDst(edit.set_line.new_text), knownHashes),
		};
	}
	if ("replace_lines" in edit) {
		const start = parseLineRef(edit.replace_lines.start_anchor);
		const end = parseLineRef(edit.replace_lines.end_anchor);
		const sameRef = start.line === end.line && start.hash === end.hash;
		return {
			spec: sameRef ? { kind: "single", ref: start } : { kind: "range", start, end },
			dstLines: stripNewLinePrefixes(splitDst(edit.replace_lines.new_text), knownHashes),
		};
	}
	if ("insert_after" in edit) {
		return {
			spec: { kind: "insertAfter", after: parseLineRef(edit.insert_after.anchor) },
			// `text` is an accepted alias; Pi fills a missing required new_text with "", so prefer whichever is non-empty.
			dstLines: stripNewLinePrefixes(splitDst(edit.insert_after.new_text || edit.insert_after.text || ""), knownHashes),
		};
	}
	if ("copy_lines" in edit) {
		const fromPath = edit.copy_lines.from_path?.trim() || undefined;
		return {
			spec: { kind: "insertAfter", after: parseLineRef(edit.copy_lines.after_anchor) },
			dstLines: [],
			copy: { start: parseLineRef(edit.copy_lines.start_anchor), end: parseLineRef(edit.copy_lines.end_anchor), fromPath },
		};
	}
	throw new Error("replace edits are applied separately");
}

/** `move_lines` is a copy of the range after the target plus deletion of the range. */
function parseHashlineEditItems(edit: HashlineEditItem, knownHashes?: ReadonlySet<string>): ParsedEdit[] {
	if ("move_lines" in edit) {
		const { start_anchor, end_anchor, after_anchor } = edit.move_lines;
		const fromPath = edit.move_lines.from_path?.trim() || undefined;
		// From another file: the copy lands here; the caller deletes the range in the source file.
		if (fromPath) {
			return [{
				spec: { kind: "insertAfter", after: parseLineRef(after_anchor) },
				dstLines: [],
				copy: { start: parseLineRef(start_anchor), end: parseLineRef(end_anchor), fromPath },
			}];
		}
		const start = parseLineRef(start_anchor);
		const end = parseLineRef(end_anchor);
		const sameRef = start.line === end.line && start.hash === end.hash;
		return [
			{
				spec: { kind: "insertAfter", after: parseLineRef(after_anchor) },
				dstLines: [],
				copy: { start: parseLineRef(start_anchor), end: parseLineRef(end_anchor) },
			},
			{ spec: sameRef ? { kind: "single", ref: start } : { kind: "range", start, end }, dstLines: [] },
		];
	}
	return [parseHashlineEditItem(edit, knownHashes)];
}

interface DestructiveSpan {
	start: number;
	end: number;
	edit: IndexedParsedEdit;
}

function getDestructiveSpan(edit: IndexedParsedEdit): DestructiveSpan | undefined {
	if (edit.spec.kind === "insertAfter") return undefined;
	if (edit.spec.kind === "single") {
		return { start: edit.spec.ref.line, end: edit.spec.ref.line, edit };
	}
	return { start: edit.spec.start.line, end: edit.spec.end.line, edit };
}

function describeDestructiveSpan(span: DestructiveSpan): string {
	return span.start === span.end ? `line ${span.start}` : `lines ${span.start}-${span.end}`;
}

function rejectOverlappingDestructiveEdits(edits: IndexedParsedEdit[]): void {
	const spans = edits.map(getDestructiveSpan).filter((span): span is DestructiveSpan => span !== undefined);

	for (let i = 0; i < spans.length; i++) {
		for (let j = i + 1; j < spans.length; j++) {
			const left = spans[i];
			const right = spans[j];
			if (left.end < right.start || right.end < left.start) continue;

			// Preserve the existing same-single path for this task so its legacy tests
			// remain green. Task 2 makes that path safe by retaining only the final
			// edit for every resolved single target before this validator runs.
			const sameSingleTarget =
				left.edit.spec.kind === "single" && right.edit.spec.kind === "single" && left.start === right.start;
			if (sameSingleTarget) continue;

			throw new HashlineOverlapError(
				`Overlapping anchored edits are not allowed: edits[${left.edit.idx}] targets ${describeDestructiveSpan(left)} and edits[${right.edit.idx}] targets ${describeDestructiveSpan(right)}.`,
			);
		}
	}
}

function rejectUnsafeInsertionBoundaries(edits: IndexedParsedEdit[]): void {
	const insertions = edits.filter(
		(edit): edit is IndexedParsedEdit & { spec: Extract<ParsedSpec, { kind: "insertAfter" }> } =>
			edit.spec.kind === "insertAfter",
	);
	const destructive = edits.map(getDestructiveSpan).filter((span): span is DestructiveSpan => span !== undefined);

	for (const insertion of insertions) {
		const boundary = insertion.spec.after.line;
		for (const span of destructive) {
			if (boundary < span.start || boundary > span.end) continue;

			const stableOneForOneSingle =
				span.edit.spec.kind === "single" && span.edit.dstLines.length === 1 && boundary === span.start;
			if (stableOneForOneSingle) continue;

			throw new HashlineOverlapError(
				`Overlapping anchored edits are not allowed: edits[${insertion.idx}] inserts after line ${boundary}, but edits[${span.edit.idx}] replaces ${describeDestructiveSpan(span)}.`,
			);
		}
	}
}

function countChangedLines(before: string[], after: string[]): number {
	let added = 0;
	let removed = 0;
	for (const change of diffArrays(before, after)) {
		if (change.added) added += change.value.length;
		else if (change.removed) removed += change.value.length;
	}
	return Math.max(added, removed);
}

// ─── Anchor resolution ──────────────────────────────────────────────────

interface AnchorResolver {
	fileLines: string[];
	lineHashes: string[];
	/** Index of the empty element after a final newline (1-based), or 0. */
	terminatorLine: number;
	notes: Set<string>;
	mismatches: HashMismatch[];
	/** Verify one anchor, relocating an unchanged line that moved. False records a mismatch. */
	validate(ref: ParsedRef): boolean;
	/** Verify both ends of a range; a relocation that changes the range size is a mismatch. */
	validateRange(start: ParsedRef, end: ParsedRef): void;
}

/**
 * Verifies `LINE:HASH` anchors against one file's lines: exact match, relocation of an unchanged
 * line within the window, or a line-free anchor that matches exactly one line. A changed line is
 * never matched to a similar one.
 */
function createAnchorResolver(fileLines: string[], relocationWindow: number, signal?: AbortSignal): AnchorResolver {
	const terminatorLine = fileLines.length > 1 && fileLines[fileLines.length - 1] === "" ? fileLines.length : 0;
	const lineHashes: string[] = [];
	const hashToLines = new Map<string, number[]>();
	for (let i = 0; i < fileLines.length; i++) {
		throwIfAborted(signal);
		const lineNumber = i + 1;
		const h = computeLineHash(lineNumber, fileLines[i]);
		lineHashes.push(h);
		const lines = hashToLines.get(h);
		if (lines) lines.push(lineNumber);
		else hashToLines.set(h, [lineNumber]);
	}
	const notes = new Set<string>();
	const mismatches: HashMismatch[] = [];

	function findRelocationLine(expectedHash: string, hintLine: number): number | undefined {
		const candidates = hashToLines.get(expectedHash);
		if (!candidates?.length) return undefined;
		const minLine = Math.max(1, hintLine - relocationWindow);
		const maxLine = Math.min(fileLines.length, hintLine + relocationWindow);
		let match: number | undefined;
		for (const candidate of candidates) {
			if (candidate < minLine || candidate > maxLine) continue;
			if (match !== undefined) return undefined; // ambiguous within window
			match = candidate;
		}
		return match;
	}

	/**
	 * Resolve an anchor pasted without its line number (`HASH` or `HASH|content`). Exactly one
	 * line must carry that hash (and the pasted content, when given); otherwise refuse.
	 */
	function resolveLineFreeRef(ref: ParsedRef): void {
		const byHash = (hashToLines.get(ref.hash) ?? []).filter((line) => line !== terminatorLine);
		const pasted = ref.content?.replace(/\r$/, "");
		const candidates = pasted === undefined ? byHash : byHash.filter((line) => fileLines[line - 1].replace(/\r$/, "") === pasted);
		const shown = ref.content === undefined ? ref.hash : `${ref.hash}|${ref.content}`;
		if (candidates.length === 1) {
			ref.line = candidates[0];
			notes.add(`Anchor "${shown}" had no line number; resolved to ${ref.line}:${ref.hash}. Copy anchors as LINE:HASH.`);
			return;
		}
		const rows = candidates
			.slice(0, 5)
			.map((line) => `  ${line}:${lineHashes[line - 1]}|${escapeControlCharsForDisplay(fileLines[line - 1])}`);
		throw new Error(
			candidates.length === 0
				? `Anchor "${shown}" has no line number and no current line matches it. Anchors are LINE:HASH, for example "5:abc" from the row "5:abc|text". Re-read the file for current anchors.`
				: `Anchor "${shown}" has no line number and matches ${candidates.length} lines. Use the full LINE:HASH anchor of the one you mean:\n${rows.join("\n")}`,
		);
	}

	function validate(ref: ParsedRef): boolean {
		if (ref.line === 0) {
			resolveLineFreeRef(ref);
			return true;
		}
		const expected = ref.hash.toLowerCase();
		const originalLine = ref.line;
		const actual = originalLine <= fileLines.length ? lineHashes[originalLine - 1] : undefined;
		if (actual === expected) return true;
		const relocated = findRelocationLine(expected, Math.min(originalLine, fileLines.length));
		if (relocated !== undefined) {
			ref.line = relocated;
			notes.add(`Auto-relocated anchor ${originalLine}:${ref.hash} -> ${relocated}:${ref.hash} (window ±${relocationWindow}).`);
			return true;
		}
		if (originalLine > fileLines.length) {
			throw new Error(`Line ${originalLine} does not exist (file has ${terminatorLine ? fileLines.length - 1 : fileLines.length} lines). Re-read the file for current anchors.`);
		}
		// No content-similarity fallback: a line whose hash changed is stale, and editing a
		// "similar" line instead would silently overwrite a change the model has not seen.
		mismatches.push({ line: originalLine, expected: ref.hash, actual: actual ?? "", expectedContent: ref.content });
		return false;
	}

	function validateRange(start: ParsedRef, end: ParsedRef): void {
		const numbered = start.line > 0 && end.line > 0;
		if (numbered && start.line > end.line) {
			throw new Error(`Range start line ${start.line} must be <= end line ${end.line}`);
		}
		const originalStart = start.line;
		const originalEnd = end.line;
		const startOk = validate(start);
		const endOk = validate(end);
		if (!startOk || !endOk) return;
		if (start.line > end.line) throw new Error(`Range start line ${start.line} must be <= end line ${end.line}`);
		// Relocation that changes the range size means lines were added or removed inside it.
		if (numbered && end.line - start.line !== originalEnd - originalStart) {
			start.line = originalStart;
			end.line = originalEnd;
			mismatches.push(
				{ line: originalStart, expected: start.hash, actual: lineHashes[originalStart - 1] },
				{ line: originalEnd, expected: end.hash, actual: lineHashes[originalEnd - 1] },
			);
		}
	}

	return { fileLines, lineHashes, terminatorLine, notes, mismatches, validate, validateRange };
}

// ─── Main edit engine ───────────────────────────────────────────────────

export function applyHashlineEdits(
	content: string,
	edits: HashlineEditItem[],
	signal?: AbortSignal,
	options: HashlineEditOptions = {},
): { content: string; firstChangedLine: number | undefined; warnings?: string[]; noopEdits?: NoopEdit[] } {
	throwIfAborted(signal);
	if (!edits.length) return { content, firstChangedLine: undefined };

	// Compute adaptive relocation window based on edit batch size
	const relocationWindow = Math.min(Math.max(HASH_RELOCATION_WINDOW_BASE, edits.length * 5), HASH_RELOCATION_WINDOW_CAP);

	const fileLines = content.split("\n");
	const origLines = [...fileLines];
	function splice(index: number, deleteCount: number, newLines: string[], copy?: { fromPath?: string; startLine: number }): void {
		options.onSplice?.(index, deleteCount, newLines, copy);
		fileLines.splice(index, deleteCount, ...newLines);
	}
	let firstChanged: number | undefined;
	const noopEdits: NoopEdit[] = [];

	// A trailing newline yields a final empty element. Read does not show it as a row, but an
	// anchor on it (from an older read) still verifies; edits on it are mapped to the end of file.
	const terminatorLine = fileLines.length > 1 && fileLines[fileLines.length - 1] === "" ? fileLines.length : 0;

	const resolver = createAnchorResolver(fileLines, relocationWindow, signal);
	const { lineHashes, validate, validateRange } = resolver;
	const relocationNotes = resolver.notes;
	const mismatches = resolver.mismatches;
	const knownHashes = new Set(lineHashes);

	const parsed: IndexedParsedEdit[] = edits.flatMap((edit, idx) =>
		parseHashlineEditItems(edit, knownHashes).map((item) => ({ ...item, idx })),
	);

	function collectExplicitlyTouchedLines(): Set<number> {
		const touched = new Set<number>();
		for (const { spec } of parsed) {
			if (spec.kind === "single") touched.add(spec.ref.line);
			else if (spec.kind === "insertAfter") touched.add(spec.after.line);
			else for (let line = spec.start.line; line <= spec.end.line; line++) touched.add(line);
		}
		return touched;
	}
	let explicitlyTouchedLines = collectExplicitlyTouchedLines();

	// Other files named by copy_lines.from_path are verified with their own resolver.
	const sourceResolvers = new Map<string, AnchorResolver>();
	function sourceResolver(fromPath: string): AnchorResolver {
		let found = sourceResolvers.get(fromPath);
		if (!found) {
			const sourceContent = options.sources?.get(fromPath);
			if (sourceContent === undefined) throw new Error(`copy_lines.from_path "${fromPath}" could not be read.`);
			found = createAnchorResolver(sourceContent.split("\n"), relocationWindow, signal);
			sourceResolvers.set(fromPath, found);
		}
		return found;
	}

	for (const p of parsed) {
		throwIfAborted(signal);
		const spec = p.spec;
		if (spec.kind === "single") {
			validate(spec.ref);
		} else if (spec.kind === "insertAfter") {
			validate(spec.after);
		} else {
			validateRange(spec.start, spec.end);
		}
		if (p.copy) {
			const source = p.copy.fromPath ? sourceResolver(p.copy.fromPath) : resolver;
			source.validateRange(p.copy.start, p.copy.end);
			if (source !== resolver && source.mismatches.length) {
				const formatted = formatMismatchError(source.mismatches, source.fileLines, relocationWindow);
				throw new Error(`copy_lines source ${p.copy.fromPath}: ${formatted.message}`);
			}
		}
	}
	for (const source of sourceResolvers.values()) for (const note of source.notes) relocationNotes.add(note);
	if (mismatches.length) {
		const formatted = formatMismatchError(mismatches, fileLines, relocationWindow);
		throw new HashlineMismatchError(formatted.message, formatted.updatedAnchors);
	}

	// Edits on the line-terminator row append before it, so the file keeps its final newline:
	// "aaa\nbbb\n" + insert after the terminator row = "aaa\nbbb\nCCC\n", not "aaa\nbbb\n\nCCC".
	if (terminatorLine) {
		const lastReal = terminatorLine - 1;
		const lastRealRef = (): ParsedRef => ({ line: lastReal, hash: lineHashes[lastReal - 1] });
		for (const p of parsed) {
			const spec = p.spec;
			if (spec.kind === "insertAfter" && spec.after.line === terminatorLine) {
				p.spec = { kind: "insertAfter", after: lastRealRef() };
			} else if (spec.kind === "single" && spec.ref.line === terminatorLine) {
				p.spec = { kind: "insertAfter", after: lastRealRef() };
			} else if (spec.kind === "range" && spec.end.line === terminatorLine) {
				p.spec = spec.start.line === lastReal
					? { kind: "single", ref: spec.start }
					: { kind: "range", start: spec.start, end: lastRealRef() };
			}
		}
	}

	// Copied lines are the source range verbatim. A range ending on a source's terminator row
	// stops at its last real line, so a copy never brings an extra empty line.
	for (const p of parsed) {
		if (!p.copy) continue;
		const source = p.copy.fromPath ? sourceResolvers.get(p.copy.fromPath)! : resolver;
		const lastReal = source.terminatorLine ? source.terminatorLine - 1 : source.fileLines.length;
		if (p.copy.start.line > lastReal) throw new Error("copy_lines start_anchor is past the last line of the source.");
		p.dstLines = source.fileLines.slice(p.copy.start.line - 1, Math.min(p.copy.end.line, lastReal));
	}

	// Recompute after potential relocation
	explicitlyTouchedLines = collectExplicitlyTouchedLines();

	// Detect conflicting duplicate single-target edits and deduplicate identical edits.
	// For single-target edits, keep the last identical occurrence so resolution remains last-wins.
	const duplicateTargetWarnings: string[] = [];
	const warnedSingleTargets = new Set<string>();
	const seenSingleTargets = new Map<string, string>();
	const seenSingleIndexByTarget = new Map<string, number>();
	const seenNonSingleEditByKey = new Map<string, number>();
	const dupes = new Set<number>();
	for (let i = 0; i < parsed.length; i++) {
		throwIfAborted(signal);
		const p = parsed[i];
		const lk =
			p.spec.kind === "single"
				? `s:${p.spec.ref.line}`
				: p.spec.kind === "range"
					? `r:${p.spec.start.line}:${p.spec.end.line}`
					: `i:${p.spec.after.line}`;
		const dstKey = p.dstLines.join("\n");
		const key = `${lk}|${dstKey}`;
		if (p.spec.kind === "single") {
			const previousIdx = seenSingleIndexByTarget.get(lk);
			if (previousIdx !== undefined) dupes.add(previousIdx);
			seenSingleIndexByTarget.set(lk, i);

			const previousDstKey = seenSingleTargets.get(lk);
			if (previousDstKey !== undefined && previousDstKey !== dstKey && !warnedSingleTargets.has(lk)) {
				duplicateTargetWarnings.push(
					`Warning: multiple edits target the same anchor ${p.spec.ref.line}:${p.spec.ref.hash} — only the last will apply`,
				);
				warnedSingleTargets.add(lk);
			}
			seenSingleTargets.set(lk, dstKey);
			continue;
		}
		if (seenNonSingleEditByKey.has(key)) {
			dupes.add(i);
		} else {
			seenNonSingleEditByKey.set(key, i);
		}
	}
	const deduped = parsed.filter((_, i) => !dupes.has(i));
	rejectOverlappingDestructiveEdits(deduped);
	rejectUnsafeInsertionBoundaries(deduped);

	// Sort bottom-up for stable splice. Insertions sharing one resolved anchor
	// apply in reverse request order because every splice uses the same boundary;
	// this preserves request order in the resulting file. Replacement ties stay
	// in request order so their existing last-wins semantics are unchanged.
	const sorted = deduped
		.map((p) => {
			const sl = p.spec.kind === "single" ? p.spec.ref.line : p.spec.kind === "range" ? p.spec.end.line : p.spec.after.line;
			const pr = p.spec.kind === "insertAfter" ? 1 : 0;
			return { ...p, sl, pr };
		})
		.sort((a, b) => {
			const byLine = b.sl - a.sl;
			if (byLine !== 0) return byLine;
			const byPriority = a.pr - b.pr;
			if (byPriority !== 0) return byPriority;
			if (a.spec.kind === "insertAfter" && b.spec.kind === "insertAfter") {
				return b.idx - a.idx;
			}
			return a.idx - b.idx;
		});
	let insertedAtSyntheticEmptyAnchor = false;
	const boundaryWarnings: string[] = [];

	function track(line: number) {
		if (firstChanged === undefined || line < firstChanged) firstChanged = line;
	}

	function maybeExpandSingleLineMerge(
		line: number,
		dst: string[],
	): { startLine: number; deleteCount: number; newLines: string[] } | null {
		if (dst.length !== 1) return null;
		if (line < 1 || line > fileLines.length) return null;

		const newLine = dst[0];
		const newCanon = stripAllWhitespace(newLine);
		const newCanonForMergeOps = stripMergeOperatorChars(newCanon);
		if (!newCanon.length) return null;

		const orig = fileLines[line - 1];
		const origCanon = stripAllWhitespace(orig);
		const origCanonForMatch = stripTrailingContinuationTokens(origCanon);
		const origCanonForMergeOps = stripMergeOperatorChars(origCanon);
		const origLooksLikeContinuation = origCanonForMatch.length < origCanon.length;
		if (!origCanon.length) return null;

		const nextIdx = line;
		const prevIdx = line - 2;

		// Case A: dst absorbed the next continuation line
		if (origLooksLikeContinuation && nextIdx < fileLines.length && !explicitlyTouchedLines.has(line + 1)) {
			const next = fileLines[nextIdx];
			const nextCanon = stripAllWhitespace(next);
			const a = newCanon.indexOf(origCanonForMatch);
			const b = newCanon.indexOf(nextCanon);
			if (a !== -1 && b !== -1 && a < b && newCanon.length <= origCanon.length + nextCanon.length + 32) {
				return { startLine: line, deleteCount: 2, newLines: [newLine] };
			}
		}

		// Case B: dst absorbed the previous continuation line
		if (prevIdx >= 0 && !explicitlyTouchedLines.has(line - 1)) {
			const prev = fileLines[prevIdx];
			const prevCanon = stripAllWhitespace(prev);
			const prevCanonForMatch = stripTrailingContinuationTokens(prevCanon);
			const prevLooksLikeContinuation = prevCanonForMatch.length < prevCanon.length;
			if (!prevLooksLikeContinuation) return null;
			const a = newCanonForMergeOps.indexOf(stripMergeOperatorChars(prevCanonForMatch));
			const b = newCanonForMergeOps.indexOf(origCanonForMergeOps);
			if (a !== -1 && b !== -1 && a < b && newCanon.length <= prevCanon.length + origCanon.length + 32) {
				return { startLine: line - 1, deleteCount: 2, newLines: [newLine] };
			}
		}

		return null;
	}

	// Apply edits bottom-up
	for (const { spec, dstLines, idx, copy } of sorted) {
		throwIfAborted(signal);
		if (spec.kind === "single") {
			const merged = maybeExpandSingleLineMerge(spec.ref.line, dstLines);
			if (merged) {
				const orig = origLines.slice(merged.startLine - 1, merged.startLine - 1 + merged.deleteCount);
				let newL = restoreIndentPaired([orig[0] ?? ""], merged.newLines);
				if (orig.join("\n") === newL.join("\n") && orig.some((line) => CONFUSABLE_HYPHENS_RE.test(line))) {
					newL = normalizeConfusableHyphensInLines(newL);
				}
				if (orig.join("\n") === newL.join("\n")) {
					noopEdits.push({ editIndex: idx, loc: `${spec.ref.line}:${spec.ref.hash}`, currentContent: orig.join("\n") });
					continue;
				}
				splice(merged.startLine - 1, merged.deleteCount, newL);
				track(merged.startLine);
				continue;
			}

			const orig = origLines.slice(spec.ref.line - 1, spec.ref.line);
			// Applied literally (issue #216 kept: an intentional dedent to column 0 is honored).
			let newL = dstLines;
			if (orig.join("\n") === newL.join("\n") && orig.some((line) => CONFUSABLE_HYPHENS_RE.test(line))) {
				newL = normalizeConfusableHyphensInLines(newL);
			}
			if (orig.length === newL.length && orig.join("\n") === newL.join("\n")) {
				noopEdits.push({ editIndex: idx, loc: `${spec.ref.line}:${spec.ref.hash}`, currentContent: orig.join("\n") });
				continue;
			}
			boundaryWarnings.push(...describeBoundaryDuplicates(origLines, spec.ref.line, spec.ref.line, newL));
			splice(spec.ref.line - 1, 1, newL);
			track(spec.ref.line);
		} else if (spec.kind === "range") {
			const count = spec.end.line - spec.start.line + 1;
			const orig = origLines.slice(spec.start.line - 1, spec.start.line - 1 + count);
			let newL = dstLines;
			if (orig.join("\n") === newL.join("\n") && orig.some((line) => CONFUSABLE_HYPHENS_RE.test(line))) {
				newL = normalizeConfusableHyphensInLines(newL);
			}
			if (orig.length === newL.length && orig.join("\n") === newL.join("\n")) {
				noopEdits.push({ editIndex: idx, loc: `${spec.start.line}:${spec.start.hash}`, currentContent: orig.join("\n") });
				continue;
			}
			boundaryWarnings.push(...describeBoundaryDuplicates(origLines, spec.start.line, spec.end.line, newL));
			splice(spec.start.line - 1, count, newL);
			track(spec.start.line);
		} else {
			const anchor = origLines[spec.after.line - 1];
			const echo = copy ? { lines: dstLines, stripped: false } : stripInsertAnchorEcho(anchor, dstLines);
			const inserted = echo.lines;
			if (echo.stripped) {
				boundaryWarnings.push(
					`insert_after text began with a copy of anchor line ${spec.after.line}; that copy was dropped. new_text holds only the new lines.`,
				);
			}
			if (!inserted.length) {
				noopEdits.push({ editIndex: idx, loc: `${spec.after.line}:${spec.after.hash}`, currentContent: anchor });
				continue;
			}
			if (content === "" && spec.after.line === 1 && anchor === "") {
				if (insertedAtSyntheticEmptyAnchor) {
					// Same-boundary insertions are being applied in reverse request order.
					splice(0, 0, inserted, copy ? { fromPath: copy.fromPath, startLine: copy.start.line } : undefined);
				} else if (fileLines.length === 1 && fileLines[0] === "") {
					// Consume the synthetic empty-line sentinel exactly once.
					splice(0, 1, inserted, copy ? { fromPath: copy.fromPath, startLine: copy.start.line } : undefined);
					insertedAtSyntheticEmptyAnchor = true;
				} else {
					// A set/range edit already consumed the sentinel; insert after its line.
					splice(spec.after.line, 0, inserted, copy ? { fromPath: copy.fromPath, startLine: copy.start.line } : undefined);
				}
				track(1);
				continue;
			}
			splice(spec.after.line, 0, inserted, copy ? { fromPath: copy.fromPath, startLine: copy.start.line } : undefined);
			track(spec.after.line + 1);
		}
	}

	const warnings: string[] = [...relocationNotes, ...duplicateTargetWarnings, ...boundaryWarnings];
	const diff = countChangedLines(origLines, fileLines);
	if (diff > edits.length * 4) {
		warnings.push(`Edit changed ${diff} lines across ${edits.length} operations — verify no unintended reformatting.`);
	}

	return {
		content: fileLines.join("\n"),
		firstChangedLine: firstChanged,
		...(warnings.length ? { warnings } : {}),
		...(noopEdits.length ? { noopEdits } : {}),
	};
}

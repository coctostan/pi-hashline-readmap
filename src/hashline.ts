/**
 * Hashline engine — hash-anchored line editing.
 *
 * Vendored & adapted from oh-my-pi (MIT, github.com/can1357/oh-my-pi).
 * Key additions ported: merge detection, confusable hyphens, restoreOldWrappedLines.
 */

import xxhashWasm from "xxhash-wasm";
import { throwIfAborted } from "./runtime";

// ─── Types ──────────────────────────────────────────────────────────────

export type HashlineEditItem =
	| { set_line: { anchor: string; new_text: string } }
	| { replace_lines: { start_anchor: string; end_anchor: string; new_text: string } }
	| { insert_after: { anchor: string; text: string } }
	| { replace: { old_text: string; new_text: string; all?: boolean } };

interface HashMismatch {
	line: number;
	expected: string;
	actual: string;
	expectedContent?: string;
}

type ParsedRef = { line: number; hash: string; content?: string };

type ParsedSpec =
	| { kind: "single"; ref: ParsedRef }
	| { kind: "range"; start: ParsedRef; end: ParsedRef }
	| { kind: "insertAfter"; after: ParsedRef };

interface ParsedEdit {
	spec: ParsedSpec;
	dstLines: string[];
}

interface NoopEdit {
	editIndex: number;
	loc: string;
	currentContent: string;
}

// ─── Hash computation ───────────────────────────────────────────────────

const HASH_LEN = 2;
const RADIX = 16;
const HASH_MOD = RADIX ** HASH_LEN;
const DICT = Array.from({ length: HASH_MOD }, (_, i) => i.toString(RADIX).padStart(HASH_LEN, "0"));

const HASHLINE_PREFIX_RE = /^\d+:[0-9a-zA-Z]{1,16}\|/;
const DIFF_PLUS_RE = /^\+(?!\+)/;
const CONFUSABLE_HYPHENS_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212\uFE63\uFF0D]/g;
const HASH_RELOCATION_WINDOW = 20;

let h32Fn: ((input: string, seed?: number) => number) | null = null;
let initPromise: Promise<void> | null = null;

export async function ensureHashInit(): Promise<void> {
	if (h32Fn) return;
	if (!initPromise) {
		initPromise = xxhashWasm().then((hasher) => {
			h32Fn = hasher.h32;
		});
	}
	await initPromise;
}

function xxh32(input: string): number {
	if (!h32Fn) throw new Error("Hash not initialized — call ensureHashInit() first");
	return h32Fn(input, 0) >>> 0;
}

export function computeLineHash(_idx: number, line: string): string {
	if (line.endsWith("\r")) line = line.slice(0, -1);
	line = line.replace(/\s+/g, "");
	return DICT[xxh32(line) % HASH_MOD];
}

export function hashLine(lineNumber: number, content: string): string {
	return `${lineNumber}:${computeLineHash(lineNumber, content)}|${content}`;
}

export function hashLines(content: string): string {
	return content
		.split("\n")
		.map((line, i) => hashLine(i + 1, line))
		.join("\n");
}

// ─── Parsing ────────────────────────────────────────────────────────────

export function parseLineRef(ref: string): { line: number; hash: string; content?: string } {
	const contentMatch = ref.match(/^[^|]*\|(.*)$/);
	const contentAfterPipe = contentMatch ? contentMatch[1] : undefined;
	const cleaned = ref.replace(/\|.*$/, "").replace(/ {2}.*$/, "").trim();
	const normalized = cleaned.replace(/\s*:\s*/, ":");
	const match = normalized.match(new RegExp(`^(\\d+):([0-9a-fA-F]{${HASH_LEN}})$`));
	if (!match) throw new Error(`Invalid line reference "${ref}". Expected "LINE:HASH" (e.g. "5:ab").`);
	const line = Number.parseInt(match[1], 10);
	if (line < 1) throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`);
	return { line, hash: match[2], content: contentAfterPipe };
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
		return `  ${c.line}:${hash}|${c.content}`;
	});
}
function formatMismatchError(mismatches: HashMismatch[], fileLines: string[]): string {
	const mismatchSet = new Map<number, HashMismatch>();
	for (const m of mismatches) mismatchSet.set(m.line, m);

	const displayLines = new Set<number>();
	for (const m of mismatches) {
		for (let i = Math.max(1, m.line - 2); i <= Math.min(fileLines.length, m.line + 2); i++) {
			displayLines.add(i);
		}
	}

	const sorted = [...displayLines].sort((a, b) => a - b);
	const out: string[] = [
		`${mismatches.length} line${mismatches.length > 1 ? "s have" : " has"} changed since last read. Auto-relocation checks only within ±${HASH_RELOCATION_WINDOW} lines of each anchor. Use the updated LINE:HASH references shown below (>>> marks changed lines).`,
		"",
	];

	let prev = -1;
	for (const num of sorted) {
		if (prev !== -1 && num > prev + 1) out.push("    ...");
		prev = num;
		const content = fileLines[num - 1];
		const hash = computeLineHash(num, content);
		const prefix = `${num}:${hash}`;
		out.push(mismatchSet.has(num) ? `>>> ${prefix}|${content}` : `    ${prefix}|${content}`);
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

	return out.join("\n");
}

// ─── DST preprocessing helpers ──────────────────────────────────────────

function splitDst(dst: string): string[] {
	if (dst === "") return [];
	const normalized = dst.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
	return normalized.split("\n");
}

function stripNewLinePrefixes(lines: string[]): string[] {
	let hashCount = 0;
	let plusCount = 0;
	let nonEmpty = 0;

	for (const l of lines) {
		if (!l.length) continue;
		nonEmpty++;
		if (HASHLINE_PREFIX_RE.test(l)) hashCount++;
		if (DIFF_PLUS_RE.test(l)) plusCount++;
	}

	if (!nonEmpty) return lines;
	const stripHash = hashCount > 0 && hashCount >= nonEmpty * 0.5;
	const stripPlus = !stripHash && plusCount > 0 && plusCount >= nonEmpty * 0.5;
	if (!stripHash && !stripPlus) return lines;

	return lines.map((l) =>
		stripHash ? l.replace(HASHLINE_PREFIX_RE, "") : stripPlus ? l.replace(DIFF_PLUS_RE, "") : l,
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

/**
 * When a model splits a single original line into multiple lines (e.g. wrapping
 * a long expression), detect this and restore the original single-line form.
 * Ported from oh-my-pi.
 */
function restoreOldWrappedLines(oldLines: string[], newLines: string[]): string[] {
	if (oldLines.length === 0 || newLines.length < 2) return newLines;

	const canonToOld = new Map<string, { line: string; count: number }>();
	for (const line of oldLines) {
		const canon = stripAllWhitespace(line);
		const bucket = canonToOld.get(canon);
		if (bucket) bucket.count++;
		else canonToOld.set(canon, { line, count: 1 });
	}

	const candidates: { start: number; len: number; replacement: string; canon: string }[] = [];
	for (let start = 0; start < newLines.length; start++) {
		for (let len = 2; len <= 10 && start + len <= newLines.length; len++) {
			const canonSpan = stripAllWhitespace(newLines.slice(start, start + len).join(""));
			const old = canonToOld.get(canonSpan);
			if (old && old.count === 1 && canonSpan.length >= 6) {
				candidates.push({ start, len, replacement: old.line, canon: canonSpan });
			}
		}
	}
	if (candidates.length === 0) return newLines;

	// Keep only spans whose canonical match is unique in the new output.
	const canonCounts = new Map<string, number>();
	for (const c of candidates) {
		canonCounts.set(c.canon, (canonCounts.get(c.canon) ?? 0) + 1);
	}
	const uniqueCandidates = candidates.filter((c) => (canonCounts.get(c.canon) ?? 0) === 1);
	if (uniqueCandidates.length === 0) return newLines;

	// Apply replacements back-to-front so indices remain stable.
	uniqueCandidates.sort((a, b) => b.start - a.start);
	const out = [...newLines];
	for (const c of uniqueCandidates) {
		out.splice(c.start, c.len, c.replacement);
	}
	return out;
}

// ─── Echo stripping ─────────────────────────────────────────────────────

function stripInsertAnchorEcho(anchorLine: string, dst: string[]): string[] {
	if (dst.length > 1 && wsEq(dst[0], anchorLine)) return dst.slice(1);
	return dst;
}

function stripRangeBoundaryEcho(fileLines: string[], start: number, end: number, dst: string[]): string[] {
	const count = end - start + 1;
	if (dst.length <= 1 || dst.length <= count) return dst;
	let out = dst;
	if (start - 2 >= 0 && wsEq(out[0], fileLines[start - 2])) out = out.slice(1);
	if (end < fileLines.length && out.length > 0 && wsEq(out[out.length - 1], fileLines[end])) out = out.slice(0, -1);
	return out;
}

// ─── Edit parser ────────────────────────────────────────────────────────

function parseHashlineEditItem(edit: HashlineEditItem): ParsedEdit {
	if ("set_line" in edit) {
		return {
			spec: { kind: "single", ref: parseLineRef(edit.set_line.anchor) },
			dstLines: stripNewLinePrefixes(splitDst(edit.set_line.new_text)),
		};
	}
	if ("replace_lines" in edit) {
		const start = parseLineRef(edit.replace_lines.start_anchor);
		const end = parseLineRef(edit.replace_lines.end_anchor);
		return {
			spec: start.line === end.line ? { kind: "single", ref: start } : { kind: "range", start, end },
			dstLines: stripNewLinePrefixes(splitDst(edit.replace_lines.new_text)),
		};
	}
	if ("insert_after" in edit) {
		return {
			spec: { kind: "insertAfter", after: parseLineRef(edit.insert_after.anchor) },
			dstLines: stripNewLinePrefixes(splitDst(edit.insert_after.text ?? "")),
		};
	}
	throw new Error("replace edits are applied separately");
}

// ─── Main edit engine ───────────────────────────────────────────────────

export function applyHashlineEdits(
	content: string,
	edits: HashlineEditItem[],
	signal?: AbortSignal,
): { content: string; firstChangedLine: number | undefined; warnings?: string[]; noopEdits?: NoopEdit[] } {
	throwIfAborted(signal);
	if (!edits.length) return { content, firstChangedLine: undefined };

	const fileLines = content.split("\n");
	const origLines = [...fileLines];
	let firstChanged: number | undefined;
	const noopEdits: NoopEdit[] = [];

	const parsed: (ParsedEdit & { idx: number })[] = edits.map((edit, idx) => ({
		...parseHashlineEditItem(edit),
		idx,
	}));

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

	// Build hash index for local-window relocation
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

	const relocationNotes = new Set<string>();

	function findRelocationLine(expectedHash: string, hintLine: number): number | undefined {
		const candidates = hashToLines.get(expectedHash);
		if (!candidates?.length) return undefined;

		const minLine = Math.max(1, hintLine - HASH_RELOCATION_WINDOW);
		const maxLine = Math.min(fileLines.length, hintLine + HASH_RELOCATION_WINDOW);
		let match: number | undefined;

		for (const candidate of candidates) {
			if (candidate < minLine || candidate > maxLine) continue;
			if (match !== undefined) return undefined; // ambiguous within window
			match = candidate;
		}
		return match;
	}

	// Validate all refs before mutation
	const mismatches: HashMismatch[] = [];

	function validate(ref: ParsedRef): boolean {
		if (ref.line < 1 || ref.line > fileLines.length)
			throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`);
		const expected = ref.hash.toLowerCase();
		const originalLine = ref.line;
		const actual = lineHashes[originalLine - 1];
		if (actual === expected) return true;
		const relocated = findRelocationLine(expected, originalLine);
		if (relocated !== undefined) {
			ref.line = relocated;
			relocationNotes.add(
				`Auto-relocated anchor ${originalLine}:${ref.hash} -> ${relocated}:${ref.hash} (window ±${HASH_RELOCATION_WINDOW}).`,
			);
			return true;
		}
		mismatches.push({ line: originalLine, expected: ref.hash, actual, expectedContent: ref.content });
		return false;
	}

	for (const { spec } of parsed) {
		throwIfAborted(signal);
		if (spec.kind === "single") {
			validate(spec.ref);
		} else if (spec.kind === "insertAfter") {
			validate(spec.after);
		} else {
			// Range: validate start > end before relocation
			if (spec.start.line > spec.end.line) {
				throw new Error(`Range start line ${spec.start.line} must be <= end line ${spec.end.line}`);
			}

			const originalStart = spec.start.line;
			const originalEnd = spec.end.line;
			const originalCount = originalEnd - originalStart + 1;

			const startOk = validate(spec.start);
			const endOk = validate(spec.end);

			// If both validated but relocation invalidated the range, revert and report mismatch
			if (startOk && endOk) {
				const relocatedCount = spec.end.line - spec.start.line + 1;
				const invalidRange = spec.start.line > spec.end.line;
				const scopeChanged = relocatedCount !== originalCount;
				if (invalidRange || scopeChanged) {
					spec.start.line = originalStart;
					spec.end.line = originalEnd;
					mismatches.push(
						{ line: originalStart, expected: spec.start.hash, actual: lineHashes[originalStart - 1] },
						{ line: originalEnd, expected: spec.end.hash, actual: lineHashes[originalEnd - 1] },
					);
				}
			}
		}
	}
	if (mismatches.length) throw new Error(formatMismatchError(mismatches, fileLines));

	// Recompute after potential relocation
	explicitlyTouchedLines = collectExplicitlyTouchedLines();

	// Deduplicate identical edits
	const seen = new Map<string, number>();
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
		const key = `${lk}|${p.dstLines.join("\n")}`;
		if (seen.has(key)) dupes.add(i);
		else seen.set(key, i);
	}
	const deduped = parsed.filter((_, i) => !dupes.has(i));

	// Sort bottom-up for stable splice
	const sorted = deduped
		.map((p) => {
			const sl = p.spec.kind === "single" ? p.spec.ref.line : p.spec.kind === "range" ? p.spec.end.line : p.spec.after.line;
			const pr = p.spec.kind === "insertAfter" ? 1 : 0;
			return { ...p, sl, pr };
		})
		.sort((a, b) => b.sl - a.sl || a.pr - b.pr || a.idx - b.idx);

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
	for (const { spec, dstLines, idx } of sorted) {
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
				fileLines.splice(merged.startLine - 1, merged.deleteCount, ...newL);
				track(merged.startLine);
				continue;
			}

			const orig = origLines.slice(spec.ref.line - 1, spec.ref.line);
			let stripped = stripRangeBoundaryEcho(origLines, spec.ref.line, spec.ref.line, dstLines);
			stripped = restoreOldWrappedLines(orig, stripped);
			let newL = restoreIndentPaired(orig, stripped);
			if (orig.join("\n") === newL.join("\n") && orig.some((line) => CONFUSABLE_HYPHENS_RE.test(line))) {
				newL = normalizeConfusableHyphensInLines(newL);
			}
			if (orig.length === newL.length && orig.join("\n") === newL.join("\n")) {
				noopEdits.push({ editIndex: idx, loc: `${spec.ref.line}:${spec.ref.hash}`, currentContent: orig.join("\n") });
				continue;
			}
			fileLines.splice(spec.ref.line - 1, 1, ...newL);
			track(spec.ref.line);
		} else if (spec.kind === "range") {
			const count = spec.end.line - spec.start.line + 1;
			const orig = origLines.slice(spec.start.line - 1, spec.start.line - 1 + count);
			let stripped = stripRangeBoundaryEcho(origLines, spec.start.line, spec.end.line, dstLines);
			stripped = restoreOldWrappedLines(orig, stripped);
			let newL = restoreIndentPaired(orig, stripped);
			if (orig.join("\n") === newL.join("\n") && orig.some((line) => CONFUSABLE_HYPHENS_RE.test(line))) {
				newL = normalizeConfusableHyphensInLines(newL);
			}
			if (orig.length === newL.length && orig.join("\n") === newL.join("\n")) {
				noopEdits.push({ editIndex: idx, loc: `${spec.start.line}:${spec.start.hash}`, currentContent: orig.join("\n") });
				continue;
			}
			fileLines.splice(spec.start.line - 1, count, ...newL);
			track(spec.start.line);
		} else {
			const anchor = origLines[spec.after.line - 1];
			const inserted = stripInsertAnchorEcho(anchor, dstLines);
			if (!inserted.length) {
				noopEdits.push({ editIndex: idx, loc: `${spec.after.line}:${spec.after.hash}`, currentContent: anchor });
				continue;
			}
			fileLines.splice(spec.after.line, 0, ...inserted);
			track(spec.after.line + 1);
		}
	}

	const warnings: string[] = [...relocationNotes];
	let diff = Math.abs(fileLines.length - origLines.length);
	for (let i = 0; i < Math.min(fileLines.length, origLines.length); i++) {
		if (fileLines[i] !== origLines[i]) diff++;
	}
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

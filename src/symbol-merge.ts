/**
 * Symbol merge: deterministic edit via pure text matching — no model needed.
 *
 * Port of FastEdit's ``deterministic_edit`` (text_match.py) to TypeScript.
 *
 * Algorithm:
 * 1. Normalize markers (#... → # ... existing code ...)
 * 2. Forward-scan snippet lines, classifying as context/new/marker/blank
 * 3. Need ≥2 context anchors for confident matching
 * 4. Sections with marker: preserve original gap (with indent adjustment)
 *    Sections without marker: drop original gap, emit new lines only
 * 5. Marker-position semantics: <new> + marker → insert at top,
 *    marker + <new> → insert at bottom (when zero body anchors)
 */

export interface MergeResult {
	result: string | null;
	reason?: string;
}

// ─── Marker normalization ────────────────────────────────────────────────

const CANONICAL_HASH_MARKER = "# ... existing code ...";
const CANONICAL_SLASH_MARKER = "// ... existing code ...";
const MARKER_PHRASES = ["... existing code ...", "// ...", "# ..."];

function isMarker(line: string): boolean {
	return MARKER_PHRASES.some((m) => line.includes(m));
}

const SHORT_HASH_RE = /^\s*#\s*\.\.\.\s*$/;
const SHORT_SLASH_RE = /^\s*\/\/\s*\.\.\.\s*$/;
const UNICODE_ELLIPSIS_RE = /^\s*…\s*$/;

/** Normalize short marker forms to canonical long form. */
export function normalizeMarkers(snippet: string): string {
	const lines = snippet.split("\n");
	const out: string[] = [];
	for (const raw of lines) {
		const indentLen = raw.length - raw.trimStart().length;
		const indent = raw.slice(0, indentLen);
		const stripped = raw.slice(indentLen).trimEnd();

		if (stripped === "#...") {
			out.push(indent + CANONICAL_HASH_MARKER);
		} else if (stripped === "//...") {
			out.push(indent + CANONICAL_SLASH_MARKER);
		} else if (stripped === "…") {
			out.push(indent + CANONICAL_HASH_MARKER);
		} else if (SHORT_HASH_RE.test(raw) && !raw.includes("existing")) {
			out.push(indent + CANONICAL_HASH_MARKER);
		} else if (SHORT_SLASH_RE.test(raw) && !raw.includes("existing")) {
			out.push(indent + CANONICAL_SLASH_MARKER);
		} else if (UNICODE_ELLIPSIS_RE.test(raw)) {
			out.push(indent + CANONICAL_HASH_MARKER);
		} else {
			out.push(raw);
		}
	}
	return out.join("\n");
}

// ─── Replacement key (assignment LHS) ────────────────────────────────────

/** Extract LHS of an assignment line for replacement matching. */
function replacementKey(line: string): string | null {
	const s = line.trim();
	if (!s) return null;

	// Find the first '=' that isn't part of ==, !=, <=, >=, =>
	let eqIdx = -1;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === "=") {
			const prev = i > 0 ? s[i - 1] : "";
			const next = i + 1 < s.length ? s[i + 1] : "";
			// Skip comparison operators and arrow functions
			if (
				prev === "=" ||
				prev === "!" ||
				prev === "<" ||
				prev === ">" ||
				next === "=" ||
				next === ">"
			) {
				continue;
			}
			// Strip compound assignment char from LHS (+=, -=, *=, etc.)
			let lhsEnd = i;
			if (lhsEnd > 0 && "+-*/%|&^:".includes(s[lhsEnd - 1])) {
				lhsEnd--;
			}
			eqIdx = lhsEnd;
			break;
		}
	}
	if (eqIdx <= 0) return null;
	const lhs = s.slice(0, eqIdx).trimEnd();
	return lhs || null;
}

// ─── Indent helpers ──────────────────────────────────────────────────────

function adjustIndent(
	newLine: string,
	refOrigIdx: number,
	refSnipIdx: number,
	snipRaw: string[],
	origLines: string[],
	refShiftedRight = false,
): string {
	const refOrig = origLines[refOrigIdx];
	const refSnip = snipRaw[refSnipIdx];

	const origIndent = refOrig.length - refOrig.trimStart().length;
	const snipIndent = refSnip.length - refSnip.trimStart().length;

	const effectiveOrigIndent = refShiftedRight ? snipIndent : origIndent;
	const indentDiff = effectiveOrigIndent - snipIndent;

	const currIndent = newLine.length - newLine.trimStart().length;
	const targetIndent = Math.max(0, currIndent + indentDiff);

	const indentChar = newLine.startsWith("\t")
		? "\t"
		: refOrig.startsWith("\t")
			? "\t"
			: " ";
	return indentChar.repeat(targetIndent) + newLine.trimStart();
}

function inferBodyIndent(origLines: string[]): { count: number; char: string } {
	for (let i = 1; i < origLines.length; i++) {
		const ln = origLines[i];
		if (ln.trim()) {
			const strippedLen = ln.length - ln.trimStart().length;
			if (strippedLen > 0) {
				return { count: strippedLen, char: ln.startsWith("\t") ? "\t" : " " };
			}
		}
	}
	return { count: 4, char: " " };
}

function reindentNewLines(
	newEntries: { line: string }[],
	targetIndent: number,
	indentChar: string,
): string[] {
	const texts = newEntries.map((e) => e.line);
	const nonBlank = texts.filter((t) => t.trim());
	if (!nonBlank.length) return [...texts];
	const base = Math.min(
		...nonBlank.map((t) => t.length - t.trimStart().length),
	);
	return texts.map((t) => {
		if (!t.trim()) return "";
		const curr = t.length - t.trimStart().length;
		const rel = curr - base;
		return indentChar.repeat(targetIndent + rel) + t.trimStart();
	});
}

// ─── Classified entry types ─────────────────────────────────────────────

type ClassifiedEntry =
	| ["context", snippetIdx: number, origIdx: number, rawLine: string]
	| ["new", snippetIdx: number, origIdx: null, rawLine: string]
	| ["marker", snippetIdx: number, origIdx: null, rawLine: string]
	| ["blank", snippetIdx: number, origIdx: null, rawLine: string];

// ─── Leading token extraction (for structural-overlap guard) ────────────

function leadingToken(line: string): string {
	const s = line.trim();
	if (!s) return "";
	let i = 0;
	while (i < s.length && !" \t(){}[]<>=,;:".includes(s[i])) {
		i++;
	}
	return s.slice(0, i);
}

const FLOW_TOKENS = new Set([
	"return",
	"raise",
	"yield",
	"throw",
	"panic!",
	"break",
	"continue",
	"goto",
]);

// ─── Position-mode emitters ─────────────────────────────────────────────

function emitPositionTop(
	origLines: string[],
	snipRaw: string[],
	newBefore: ClassifiedEntry[],
	originalFunc: string,
): string {
	// Take everything up to the first non-blank line in orig (the signature)
	let sigEnd = 1;
	for (let i = 0; i < origLines.length; i++) {
		if (origLines[i].trim()) {
			sigEnd = i + 1;
			break;
		}
	}
	const prefix = origLines.slice(0, sigEnd);
	const rest = origLines.slice(sigEnd);

	const { count: targetIndent, char: indentChar } = inferBodyIndent(origLines);
	const reIndented = reindentNewLines(
		newBefore.map((e) => ({ line: e[3] })),
		targetIndent,
		indentChar,
	);

	const result = [...prefix, ...reIndented, ...rest];
	let merged = result.join("\n");
	if (originalFunc.endsWith("\n") && !merged.endsWith("\n")) merged += "\n";
	return merged;
}

function emitPositionBottom(
	origLines: string[],
	snipRaw: string[],
	newAfter: ClassifiedEntry[],
	originalFunc: string,
): string {
	const { count: targetIndent, char: indentChar } = inferBodyIndent(origLines);
	const reIndented = reindentNewLines(
		newAfter.map((e) => ({ line: e[3] })),
		targetIndent,
		indentChar,
	);
	const result = [...origLines, ...reIndented];
	let merged = result.join("\n");
	if (originalFunc.endsWith("\n") && !merged.endsWith("\n")) merged += "\n";
	return merged;
}

// ─── Main algorithm ──────────────────────────────────────────────────────

/**
 * Apply an edit via pure text matching — no model needed.
 *
 * @param originalFunc The original function/symbol code as a string.
 * @param snippet The edit snippet (context lines + new lines + optional markers).
 * @param maxDropGap Maximum number of original lines to silently drop in a
 *        gap without a marker. If exceeded, returns null (fall back).
 * @returns The merged code, or null if deterministic matching cannot apply.
 */
export function deterministicMerge(
	originalFunc: string,
	snippet: string,
	maxDropGap = 20,
): MergeResult {
	const normalized = normalizeMarkers(snippet);
	const origLines = originalFunc.split("\n");
	const origStripped = origLines.map((l) => l.trim());
	const snipRaw = normalized.split("\n");

	// ── Step 1: Classify each snippet line via forward scan ──
	const classified: ClassifiedEntry[] = [];
	let origCursor = 0;

	for (let si = 0; si < snipRaw.length; si++) {
		const sl = snipRaw[si];
		const stripped = sl.trim();

		if (!stripped) {
			classified.push(["blank", si, null, sl]);
			continue;
		}
		if (isMarker(sl)) {
			classified.push(["marker", si, null, sl]);
			continue;
		}

		// Ambiguous anchors (e.g. lone `}`) are treated as normal context
		// candidates — the indent consistency check below rejects false matches
		// (e.g. a snippet `}` at indent-4 won't match an original `}` at indent-0).
		// Previously we skipped these, which caused ordering bugs when the
		// skipped line's position in the snippet was lost.

		let foundIdx: number | null = null;
		for (let oi = origCursor; oi < origStripped.length; oi++) {
			if (origStripped[oi] === stripped) {
				// Indent consistency check
				const prevContexts = classified.filter((c) => c[0] === "context") as [
					"context",
					number,
					number,
					string,
				][];
				if (prevContexts.length > 0) {
					const refCtx = prevContexts[prevContexts.length - 1];
					const refOrigIndent =
						origLines[refCtx[2]].length -
						origLines[refCtx[2]].trimStart().length;
					const refSnipIndent =
						snipRaw[refCtx[1]].length - snipRaw[refCtx[1]].trimStart().length;
					const expectedDiff = refOrigIndent - refSnipIndent;

					const origIndent =
						origLines[oi].length - origLines[oi].trimStart().length;
					const snipIndent = sl.length - sl.trimStart().length;
					const actualDiff = origIndent - snipIndent;

					if (Math.abs(actualDiff - expectedDiff) > 2) continue; // false match
				}
				foundIdx = oi;
				origCursor = oi + 1;
				break;
			}
		}

		if (foundIdx !== null) {
			classified.push(["context", si, foundIdx, sl]);
		} else {
			classified.push(["new", si, null, sl]);
		}
	}

	const contextEntries = classified.filter(
		(c): c is ["context", number, number, string] => c[0] === "context",
	);

	// ── Marker-position semantics (when zero body anchors) ──
	const bodyAnchors = contextEntries.filter((c) => c[2] > 0);
	const markerEntries = classified.filter((c) => c[0] === "marker") as [
		"marker",
		number,
		null,
		string,
	][];
	const newEntries = classified.filter((c) => c[0] === "new") as [
		"new",
		number,
		null,
		string,
	][];

	if (
		bodyAnchors.length === 0 &&
		markerEntries.length === 1 &&
		newEntries.length >= 1
	) {
		const markerSi = markerEntries[0][1];
		const newBefore = newEntries.filter((e) => e[1] < markerSi);
		const newAfter = newEntries.filter((e) => e[1] > markerSi);

		// Structural-overlap guard: if a "new" line's leading token matches
		// an original body flow token, the author likely modifies in place.
		const bodyLeadingTokens = new Set<string>();
		for (let i = 1; i < origLines.length; i++) {
			if (origLines[i].trim()) {
				bodyLeadingTokens.add(leadingToken(origLines[i]));
			}
		}

		function isNestedInNewOpener(entry: ClassifiedEntry): boolean {
			const siE = entry[1];
			const line = entry[3];
			const lineIndent = line.length - line.trimStart().length;
			for (const other of newEntries) {
				if (other[1] >= siE) break;
				const otherLine = other[3];
				if (!otherLine.trim()) continue;
				const otherStripped = otherLine.trimEnd();
				if (!otherStripped.endsWith(":") && !otherStripped.endsWith("{"))
					continue;
				const otherIndent = otherLine.length - otherLine.trimStart().length;
				if (lineIndent > otherIndent) return true;
			}
			return false;
		}

		const newLeadingTokens = new Set<string>();
		for (const e of newEntries) {
			if (e[3].trim() && !isNestedInNewOpener(e)) {
				newLeadingTokens.add(leadingToken(e[3]));
			}
		}

		const overlap = new Set<string>();
		for (const tk of newLeadingTokens) {
			if (FLOW_TOKENS.has(tk) && bodyLeadingTokens.has(tk)) {
				overlap.add(tk);
			}
		}

		if (overlap.size > 0) {
			// Overlap → fall through to <2 anchors rejection
		} else if (newBefore.length > 0 && newAfter.length > 0) {
			// Ambiguous: new lines on both sides, no body anchors → fall through
		} else if (newBefore.length > 0 && newAfter.length === 0) {
			// Pattern: <new_lines> + marker → insert at top
			return emitPositionTop(origLines, snipRaw, newBefore, originalFunc);
		} else if (newAfter.length > 0 && newBefore.length === 0) {
			// Pattern: marker + <new_lines> → insert at bottom
			return emitPositionBottom(origLines, snipRaw, newAfter, originalFunc);
		}
		// else: marker with no new lines → no-op; fall through to <2 anchors
	}

	// ── Need at least 2 context anchors ──
	if (contextEntries.length < 2) {
		const count = contextEntries.length;
		const hint =
			count === 0
				? "The replacement must include the **full** symbol (signature + body + closing brace). Partial snippets or diff-style edits are not supported — every line in the replacement must either match the original or be new code."
				: "Only 1 anchor line found (need ≥2). The replacement must include the full symbol — signature + body + closing brace — so at least 2 lines match the original as context anchors.";
		return {
			result: null,
			reason: `Only ${count} anchor line(s) found in replacement (need ≥2). ${hint}`,
		};
	}

	// ── Safety: reject if a large gap would be dropped without a marker ──
	for (let ci = 0; ci < contextEntries.length - 1; ci++) {
		const curr = contextEntries[ci];
		const next = contextEntries[ci + 1];
		const gapSize = next[2] - curr[2] - 1;
		if (gapSize <= 0) continue;

		const hasMarker = classified.some(
			(c) => c[0] === "marker" && curr[1] < c[1] && c[1] < next[1],
		);
		if (!hasMarker && gapSize > maxDropGap)
			return {
				result: null,
				reason:
					"Gap of " +
					gapSize +
					" original line(s) would be dropped without a marker (maxDropGap=" +
					maxDropGap +
					"). Add #... or //... markers in the replacement to indicate where existing code should be kept.",
			};
	}

	const firstOrigIdx = contextEntries[0][2];
	const lastOrigIdx = contextEntries[contextEntries.length - 1][2];

	// ── Step 2: Build result using section-based processing ──
	const result: string[] = [];

	// Handle leading new lines (signature replacement)
	const firstCtxSi = contextEntries[0][1];
	const leadingNew = classified.filter(
		(e) => e[1] < firstCtxSi && e[0] === "new",
	) as ["new", number, null, string][];

	const firstCtxOrigIdx = contextEntries[0][2];
	const firstCtxSiIdx = contextEntries[0][1];
	const firstAnchorOrigIndent =
		origLines[firstCtxOrigIdx].length -
		origLines[firstCtxOrigIdx].trimStart().length;
	const firstAnchorSnipIndent =
		snipRaw[firstCtxSiIdx].length - snipRaw[firstCtxSiIdx].trimStart().length;
	const firstAnchorShiftedRight = firstAnchorSnipIndent > firstAnchorOrigIndent;

	if (leadingNew.length > 0 && firstOrigIdx > 0) {
		// Replace prefix with leading new lines
		for (const entry of leadingNew) {
			result.push(
				adjustIndent(
					entry[3],
					firstCtxOrigIdx,
					firstCtxSiIdx,
					snipRaw,
					origLines,
					firstAnchorShiftedRight,
				),
			);
		}
	} else if (leadingNew.length > 0) {
		// No prefix to replace
		for (const entry of leadingNew) {
			result.push(
				adjustIndent(
					entry[3],
					firstCtxOrigIdx,
					firstCtxSiIdx,
					snipRaw,
					origLines,
					firstAnchorShiftedRight,
				),
			);
		}
	} else {
		// Emit original prefix verbatim
		result.push(...origLines.slice(0, firstOrigIdx));
	}

	// Process sections between consecutive context anchors
	for (let ci = 0; ci < contextEntries.length; ci++) {
		const ctx = contextEntries[ci];
		const ctxOrig = ctx[2];
		const ctxSi = ctx[1];

		// Emit context anchor line (with indent adjustment for wrap_block)
		const origAnchorLine = origLines[ctxOrig];
		const snipAnchorLine = snipRaw[ctxSi];
		const origAnchorIndent =
			origAnchorLine.length - origAnchorLine.trimStart().length;
		const snipAnchorIndent =
			snipAnchorLine.length - snipAnchorLine.trimStart().length;
		const anchorIndentDelta = snipAnchorIndent - origAnchorIndent;
		const anchorShiftedRight = anchorIndentDelta > 0;

		if (anchorShiftedRight) {
			const indentChar = origAnchorLine.startsWith("\t") ? "\t" : " ";
			result.push(indentChar.repeat(anchorIndentDelta) + origAnchorLine);
		} else {
			result.push(origAnchorLine);
		}

		if (ci === contextEntries.length - 1) break; // trailing section handled below

		const nextCtx = contextEntries[ci + 1];
		const nextCtxOrig = nextCtx[2];
		const nextCtxSi = nextCtx[1];

		// Collect snippet entries in this section
		const section = classified.filter((c) => ctxSi < c[1] && c[1] < nextCtxSi);

		const hasMarker = section.some((e) => e[0] === "marker");
		const markerCount = section.filter((e) => e[0] === "marker").length;

		if (markerCount >= 2)
			return {
				result: null,
				reason:
					"Section has " +
					markerCount +
					" markers — too ambiguous to determine which existing code to keep. Use at most 1 marker per section.",
			};

		if (hasMarker) {
			// Marker mode: keep original gap, emit new lines relative to marker
			const markerEntry = section.find((e) => e[0] === "marker")!;
			const markerSnipIndent =
				snipRaw[markerEntry[1]].length -
				snipRaw[markerEntry[1]].trimStart().length;

			// Find first non-blank line in original gap for indent delta
			let firstGapOrigIndent: number | null = null;
			for (let i = ctxOrig + 1; i < nextCtxOrig; i++) {
				if (origLines[i].trim()) {
					firstGapOrigIndent =
						origLines[i].length - origLines[i].trimStart().length;
					break;
				}
			}

			const ctxOrigIndent =
				origLines[ctxOrig].length - origLines[ctxOrig].trimStart().length;
			const ctxSnipIndent =
				snipRaw[ctxSi].length - snipRaw[ctxSi].trimStart().length;
			const indentDelta =
				firstGapOrigIndent !== null
					? markerSnipIndent -
						ctxSnipIndent -
						(firstGapOrigIndent - ctxOrigIndent)
					: 0;
			const indentChar = origLines[ctxOrig].startsWith("\t") ? "\t" : " ";

			// Build replacement-key map for new lines in this section
			const newLineKeyIndents = new Map<string, Set<number>>();
			for (const entry of section) {
				if (entry[0] === "new") {
					const key = replacementKey(entry[3]);
					if (key !== null) {
						if (!newLineKeyIndents.has(key))
							newLineKeyIndents.set(key, new Set());
						newLineKeyIndents
							.get(key)!
							.add(entry[3].length - entry[3].trimStart().length);
					}
				}
			}

			// Count gap-line matches per (key, indent)
			const gapMatchCounts = new Map<string, number>();
			for (let i = ctxOrig + 1; i < nextCtxOrig; i++) {
				const gapLine = origLines[i];
				if (!gapLine.trim()) continue;
				const key = replacementKey(gapLine);
				if (key === null || !newLineKeyIndents.has(key)) continue;
				const gapIndent = gapLine.length - gapLine.trimStart().length;
				if (!newLineKeyIndents.get(key)!.has(gapIndent)) continue;
				const k = `${key}@${gapIndent}`;
				gapMatchCounts.set(k, (gapMatchCounts.get(k) ?? 0) + 1);
			}

			let gapEmitted = false;
			for (const entry of section) {
				if (entry[0] === "marker" && !gapEmitted) {
					for (let i = ctxOrig + 1; i < nextCtxOrig; i++) {
						const gapLine = origLines[i];
						if (!gapLine.trim()) {
							result.push(gapLine); // preserve blank lines
							continue;
						}
						// Skip gap lines uniquely identified as being replaced
						const key = replacementKey(gapLine);
						if (key !== null && newLineKeyIndents.has(key)) {
							const gapIndent = gapLine.length - gapLine.trimStart().length;
							const k = `${key}@${gapIndent}`;
							if (
								newLineKeyIndents.get(key)!.has(gapIndent) &&
								gapMatchCounts.get(k) === 1
							) {
								continue;
							}
						}
						if (indentDelta > 0) {
							result.push(indentChar.repeat(indentDelta) + gapLine);
						} else if (indentDelta < 0) {
							const strip = Math.min(
								-indentDelta,
								gapLine.length - gapLine.trimStart().length,
							);
							result.push(gapLine.slice(strip));
						} else {
							result.push(gapLine);
						}
					}
					gapEmitted = true;
				} else if (entry[0] === "new") {
					result.push(
						adjustIndent(
							entry[3],
							ctxOrig,
							ctxSi,
							snipRaw,
							origLines,
							anchorShiftedRight,
						),
					);
				}
			}
		} else {
			// No marker: drop original gap, emit new lines and blanks
			for (const entry of section) {
				if (entry[0] === "new") {
					result.push(
						adjustIndent(
							entry[3],
							ctxOrig,
							ctxSi,
							snipRaw,
							origLines,
							anchorShiftedRight,
						),
					);
				} else if (entry[0] === "blank") {
					result.push("");
				}
			}
		}
	}

	// ── Trailing section ──
	const lastCtxSi = contextEntries[contextEntries.length - 1][1];
	const trailing = classified.filter((c) => c[1] > lastCtxSi);

	let trailingMarker: ClassifiedEntry | null = null;
	for (const e of trailing) {
		if (e[0] === "marker") {
			trailingMarker = e;
			break;
		}
	}

	let trailingIndentDelta = 0;
	let trailingIndentChar = " ";
	if (trailingMarker !== null) {
		const markerSnipIndent =
			snipRaw[trailingMarker[1]].length -
			snipRaw[trailingMarker[1]].trimStart().length;
		let firstSuffixOrigIndent: number | null = null;
		for (let i = lastOrigIdx + 1; i < origLines.length; i++) {
			if (origLines[i].trim()) {
				firstSuffixOrigIndent =
					origLines[i].length - origLines[i].trimStart().length;
				break;
			}
		}
		const lastCtxOrig = contextEntries[contextEntries.length - 1][2];
		const ctxOrigIndentT =
			origLines[lastCtxOrig].length - origLines[lastCtxOrig].trimStart().length;
		const ctxSnipIndentT =
			snipRaw[lastCtxSi].length - snipRaw[lastCtxSi].trimStart().length;
		trailingIndentDelta =
			firstSuffixOrigIndent !== null
				? markerSnipIndent -
					ctxSnipIndentT -
					(firstSuffixOrigIndent - ctxOrigIndentT)
				: 0;
		trailingIndentChar = origLines[lastCtxOrig].startsWith("\t") ? "\t" : " ";
	}

	// Replacement-key tracking for trailing section
	const trailingNewKeyIndents = new Map<string, Set<number>>();
	for (const entry of trailing) {
		if (entry[0] === "new") {
			const key = replacementKey(entry[3]);
			if (key !== null) {
				if (!trailingNewKeyIndents.has(key))
					trailingNewKeyIndents.set(key, new Set());
				trailingNewKeyIndents
					.get(key)!
					.add(entry[3].length - entry[3].trimStart().length);
			}
		}
	}

	const trailingMatchCounts = new Map<string, number>();
	for (let i = lastOrigIdx + 1; i < origLines.length; i++) {
		const line = origLines[i];
		if (!line.trim()) continue;
		const key = replacementKey(line);
		if (key === null || !trailingNewKeyIndents.has(key)) continue;
		const indent = line.length - line.trimStart().length;
		if (!trailingNewKeyIndents.get(key)!.has(indent)) continue;
		const k = `${key}@${indent}`;
		trailingMatchCounts.set(k, (trailingMatchCounts.get(k) ?? 0) + 1);
	}

	const lastCtxOrigIdx = contextEntries[contextEntries.length - 1][2];
	const lastCtxSiIdx = contextEntries[contextEntries.length - 1][1];
	const lastAnchorOrigIndent =
		origLines[lastCtxOrigIdx].length -
		origLines[lastCtxOrigIdx].trimStart().length;
	const lastAnchorSnipIndent =
		snipRaw[lastCtxSiIdx].length - snipRaw[lastCtxSiIdx].trimStart().length;
	const lastAnchorShiftedRight = lastAnchorSnipIndent > lastAnchorOrigIndent;

	let suffixEmitted = false;
	for (const entry of trailing) {
		if (entry[0] === "marker" && !suffixEmitted) {
			// Emit suffix lines with indent adjustment
			for (let i = lastOrigIdx + 1; i < origLines.length; i++) {
				const line = origLines[i];
				if (!line.trim()) {
					result.push(line);
					continue;
				}
				const key = replacementKey(line);
				if (key !== null && trailingNewKeyIndents.has(key)) {
					const indent = line.length - line.trimStart().length;
					const k = `${key}@${indent}`;
					if (
						trailingNewKeyIndents.get(key)!.has(indent) &&
						trailingMatchCounts.get(k) === 1
					) {
						continue;
					}
				}
				if (trailingIndentDelta > 0) {
					result.push(trailingIndentChar.repeat(trailingIndentDelta) + line);
				} else if (trailingIndentDelta < 0) {
					const strip = Math.min(
						-trailingIndentDelta,
						line.length - line.trimStart().length,
					);
					result.push(line.slice(strip));
				} else {
					result.push(line);
				}
			}
			suffixEmitted = true;
		} else if (entry[0] === "new") {
			result.push(
				adjustIndent(
					entry[3],
					lastCtxOrigIdx,
					lastCtxSiIdx,
					snipRaw,
					origLines,
					lastAnchorShiftedRight,
				),
			);
		} else if (entry[0] === "blank" && !suffixEmitted) {
			result.push("");
		}
	}

	if (!suffixEmitted) {
		const hasTrailingNew = trailing.some((e) => e[0] === "new");
		if (!hasTrailingNew) {
			result.push(...origLines.slice(lastOrigIdx + 1));
		}
	}

	let merged = result.join("\n");
	// Preserve trailing newline
	if (originalFunc.endsWith("\n") && !merged.endsWith("\n")) merged += "\n";

	return { result: merged };
}

/**
 * Post-merge syntax validation: parse the merged file with tree-sitter
 * and return error node locations. Returns null if parser not available.
 */
export function checkSyntaxErrors(
	content: string,
	languageId: string,
): { line: number; message: string }[] | null {
	// Map language id to tree-sitter grammar
	let parser: any = null;
	try {
		const ParserCtor = require("tree-sitter") as typeof import("tree-sitter");
		let lang: any = null;
		switch (languageId) {
			case "java": {
				const mod = require("tree-sitter-java");
				lang = mod.default ?? mod;
				break;
			}
			case "rust": {
				const mod = require("tree-sitter-rust");
				lang = mod.default ?? mod;
				break;
			}
			case "cpp":
			case "c-header": {
				const mod = require("tree-sitter-cpp");
				lang = mod.default ?? mod;
				break;
			}
			default:
				return null; // No parser available for this language
		}
		if (!lang) return null;
		const p = new ParserCtor();
		p.setLanguage(lang);
		parser = p;
	} catch {
		return null; // tree-sitter not available
	}
	if (!parser) return null;

	const tree = parser.parse(content);
	const errors: { line: number; message: string }[] = [];

	function walk(node: any): void {
		if (node.type === "ERROR" || node.isError) {
			errors.push({
				line: node.startPosition.row + 1, // 1-based
				message: `Syntax error at line ${node.startPosition.row + 1}: unexpected token "${node.type === "ERROR" ? (node.children[0]?.type ?? "?") : node.type}"`,
			});
			return; // Don't recurse into error subtrees
		}
		for (const child of node.children) {
			walk(child);
		}
	}
	walk(tree.rootNode);

	return errors;
}

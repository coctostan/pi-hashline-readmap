import * as Diff from "diff";
import { computeLineHash } from "./hashline";

// ─── Line ending normalization ──────────────────────────────────────────

export function detectLineEnding(content: string): "\r\n" | "\n" {
	const crlfIdx = content.indexOf("\r\n");
	const lfIdx = content.indexOf("\n");
	if (lfIdx === -1 || crlfIdx === -1) return "\n";
	return crlfIdx < lfIdx ? "\r\n" : "\n";
}

export function normalizeToLF(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
	return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

export function stripBom(content: string): { bom: string; text: string } {
	return content.startsWith("\uFEFF") ? { bom: "\uFEFF", text: content.slice(1) } : { bom: "", text: content };
}

/**
 * Detect bare \r characters that are NOT part of \r\n sequences.
 * These cause line-count mismatches between normalizeToLF and external tools (ripgrep, wc).
 */
export function hasBareCarriageReturn(content: string): boolean {
	// Remove all \r\n first, then check if any \r remains
	return content.replace(/\r\n/g, "").includes("\r");
}

// ─── Fuzzy text matching ────────────────────────────────────────────────

const SINGLE_QUOTES_RE = /[\u2018\u2019\u201A\u201B]/g;
const DOUBLE_QUOTES_RE = /[\u201C\u201D\u201E\u201F]/g;
const HYPHENS_RE = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;
const UNICODE_SPACES_RE = /[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g;

function normalizeFuzzyChar(ch: string): string {
	return ch.replace(SINGLE_QUOTES_RE, "'").replace(DOUBLE_QUOTES_RE, '"').replace(HYPHENS_RE, "-").replace(UNICODE_SPACES_RE, " ");
}

function normalizeForFuzzyMatch(text: string): string {
	return text
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(SINGLE_QUOTES_RE, "'")
		.replace(DOUBLE_QUOTES_RE, '"')
		.replace(HYPHENS_RE, "-")
		.replace(UNICODE_SPACES_RE, " ");
}

function buildNormalizedWithMap(text: string): { normalized: string; indexMap: number[] } {
	const lines = text.split("\n");
	const normalizedChars: string[] = [];
	const indexMap: number[] = [];
	let originalOffset = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const trimmed = line.replace(/\s+$/u, "");

		for (let j = 0; j < trimmed.length; j++) {
			normalizedChars.push(normalizeFuzzyChar(trimmed[j]!));
			indexMap.push(originalOffset + j);
		}

		if (i < lines.length - 1) {
			normalizedChars.push("\n");
			indexMap.push(originalOffset + line.length);
		}

		originalOffset += line.length + 1;
	}

	return { normalized: normalizedChars.join(""), indexMap };
}

function mapNormalizedSpanToOriginal(
	indexMap: number[],
	normalizedStart: number,
	normalizedLength: number,
): { index: number; matchLength: number } | null {
	if (normalizedStart < 0 || normalizedLength <= 0) return null;
	const normalizedEnd = normalizedStart + normalizedLength;
	if (normalizedEnd > indexMap.length) return null;

	const start = indexMap[normalizedStart];
	const end = indexMap[normalizedEnd - 1];
	if (start === undefined || end === undefined || end < start) return null;

	return { index: start, matchLength: end - start + 1 };
}

/**
 * Find `oldText` in `content` with optional fuzzy whitespace/unicode matching.
 * Always returns an index/length in the original content.
 */
export function fuzzyFindText(
	content: string,
	oldText: string,
): { found: boolean; index: number; matchLength: number; usedFuzzyMatch: boolean } {
	const exactIndex = content.indexOf(oldText);
	if (exactIndex !== -1) {
		return { found: true, index: exactIndex, matchLength: oldText.length, usedFuzzyMatch: false };
	}

	const normalizedNeedle = normalizeForFuzzyMatch(oldText);
	if (!normalizedNeedle.length) return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false };

	const { normalized, indexMap } = buildNormalizedWithMap(content);
	const normalizedIndex = normalized.indexOf(normalizedNeedle);
	if (normalizedIndex === -1) {
		return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false };
	}

	const mapped = mapNormalizedSpanToOriginal(indexMap, normalizedIndex, normalizedNeedle.length);
	if (!mapped) {
		return { found: false, index: -1, matchLength: 0, usedFuzzyMatch: false };
	}

	return { found: true, index: mapped.index, matchLength: mapped.matchLength, usedFuzzyMatch: true };
}

/**
 * Replace `oldText` with `newText` in `content`.
 * Fuzzy matching only determines target spans; replacement always applies to
 * the original content (never normalizes the whole file).
 */
export function replaceText(
	content: string,
	oldText: string,
	newText: string,
	opts: { all?: boolean },
): { content: string; count: number } {
	if (!oldText.length) return { content, count: 0 };
	const normalizedNew = normalizeToLF(newText);

	if (opts.all) {
		const exactCount = content.split(oldText).length - 1;
		if (exactCount > 0) {
			return { content: content.split(oldText).join(normalizedNew), count: exactCount };
		}

		const normalizedNeedle = normalizeForFuzzyMatch(oldText);
		if (!normalizedNeedle.length) return { content, count: 0 };

		const { normalized, indexMap } = buildNormalizedWithMap(content);
		const spans: Array<{ index: number; matchLength: number }> = [];
		let searchFrom = 0;

		while (searchFrom <= normalized.length - normalizedNeedle.length) {
			const pos = normalized.indexOf(normalizedNeedle, searchFrom);
			if (pos === -1) break;
			const mapped = mapNormalizedSpanToOriginal(indexMap, pos, normalizedNeedle.length);
			if (mapped) {
				const prev = spans[spans.length - 1];
				if (!prev || mapped.index >= prev.index + prev.matchLength) {
					spans.push(mapped);
				}
			}
			searchFrom = pos + Math.max(1, normalizedNeedle.length);
		}

		if (!spans.length) return { content, count: 0 };

		let out = content;
		for (let i = spans.length - 1; i >= 0; i--) {
			const span = spans[i]!;
			out = out.substring(0, span.index) + normalizedNew + out.substring(span.index + span.matchLength);
		}
		return { content: out, count: spans.length };
	}

	const result = fuzzyFindText(content, oldText);
	if (!result.found) return { content, count: 0 };

	return {
		content: content.substring(0, result.index) + normalizedNew + content.substring(result.index + result.matchLength),
		count: 1,
	};
}

// ─── Diff generation ────────────────────────────────────────────────────

export function generateDiffString(
	oldContent: string,
	newContent: string,
	contextLines = 4,
): { diff: string; firstChangedLine: number | undefined } {
	const parts = Diff.diffLines(oldContent, newContent);
	const output: string[] = [];
	const maxLineNum = Math.max(oldContent.split("\n").length, newContent.split("\n").length);
	const lineNumWidth = String(maxLineNum).length;
	let oldLineNum = 1;
	let newLineNum = 1;
	let lastWasChange = false;
	let firstChangedLine: number | undefined;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]!;
		const raw = part.value.split("\n");
		if (raw[raw.length - 1] === "") raw.pop();

		if (part.added || part.removed) {
			if (firstChangedLine === undefined) firstChangedLine = newLineNum;
			for (const line of raw) {
				if (part.added) {
					output.push(`+${String(newLineNum).padStart(lineNumWidth, " ")} ${line}`);
					newLineNum++;
				} else {
					output.push(`-${String(oldLineNum).padStart(lineNumWidth, " ")} ${line}`);
					oldLineNum++;
				}
			}
			lastWasChange = true;
			continue;
		}

		const nextPartIsChange = i < parts.length - 1 && (parts[i + 1]!.added || parts[i + 1]!.removed);
		if (lastWasChange || nextPartIsChange) {
			let linesToShow = raw;
			let skipStart = 0;
			let skipEnd = 0;

			if (!lastWasChange) {
				skipStart = Math.max(0, raw.length - contextLines);
				linesToShow = raw.slice(skipStart);
			}
			if (!nextPartIsChange && linesToShow.length > contextLines) {
				skipEnd = linesToShow.length - contextLines;
				linesToShow = linesToShow.slice(0, contextLines);
			}

			if (skipStart > 0) {
				output.push(` ${"".padStart(lineNumWidth, " ")} ...`);
				oldLineNum += skipStart;
				newLineNum += skipStart;
			}
			for (const line of linesToShow) {
				output.push(` ${String(oldLineNum).padStart(lineNumWidth, " ")} ${line}`);
				oldLineNum++;
				newLineNum++;
			}
			if (skipEnd > 0) {
				output.push(` ${"".padStart(lineNumWidth, " ")} ...`);
				oldLineNum += skipEnd;
				newLineNum += skipEnd;
			}
		} else {
			oldLineNum += raw.length;
			newLineNum += raw.length;
		}
		lastWasChange = false;
	}

	return { diff: output.join("\n"), firstChangedLine };
}

/**
 * Generate a compact diff for single-line edits, or fall back to the full diff.
 *
 * - Single-line replacement: `LINE:HASH|old → LINE:HASH|new`
 * - Single-line deletion: `LINE:HASH|old → [deleted]`
 * - Multi-line changes: full output from generateDiffString()
 */
export function generateCompactOrFullDiff(
	oldContent: string,
	newContent: string,
	contextLines = 4,
): { diff: string; firstChangedLine: number | undefined } {
	if (oldContent === newContent) return { diff: "", firstChangedLine: undefined };

	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");

	// Case 1: Same line count, exactly one changed line → compact replacement.
	if (oldLines.length === newLines.length) {
		let changedIndex = -1;
		let changeCount = 0;

		for (let i = 0; i < oldLines.length; i++) {
			if (oldLines[i] !== newLines[i]) {
				changedIndex = i;
				changeCount++;
				if (changeCount > 1) break;
			}
		}

		if (changeCount === 1 && changedIndex >= 0) {
			const lineNum = changedIndex + 1;
			const oldLine = oldLines[changedIndex] ?? "";
			const newLine = newLines[changedIndex] ?? "";
			const oldHash = computeLineHash(lineNum, oldLine);
			const newHash = computeLineHash(lineNum, newLine);
			return {
				diff: `${lineNum}:${oldHash}|${oldLine} → ${lineNum}:${newHash}|${newLine}`,
				firstChangedLine: lineNum,
			};
		}
	}

	// Case 2: Exactly one line deleted.
	// old has one more line than new, and removing a single line makes them equal.
	if (oldLines.length === newLines.length + 1) {
		let deletedIndex = -1;
		let j = 0;
		let failed = false;

		for (let i = 0; i < oldLines.length; i++) {
			if (j < newLines.length && oldLines[i] === newLines[j]) {
				j++;
				continue;
			}
			if (deletedIndex === -1) {
				deletedIndex = i;
				continue;
			}
			failed = true;
			break;
		}

		if (!failed && deletedIndex !== -1 && j === newLines.length) {
			const lineNum = deletedIndex + 1;
			const oldLine = oldLines[deletedIndex] ?? "";
			const oldHash = computeLineHash(lineNum, oldLine);
			return {
				diff: `${lineNum}:${oldHash}|${oldLine} → [deleted]`,
				firstChangedLine: lineNum,
			};
		}
	}

	// Fall back to the full (existing) diff format.
	return generateDiffString(oldContent, newContent, contextLines);
}

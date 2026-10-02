import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { normalizeToLF, stripBom } from "./edit-diff.js";
import { computeLineHash, parseLineRef, splitDisplayLines, type HashlineEditItem } from "./hashline.js";

/**
 * Detects a block of lines retyped from a file the model read, where the retype silently changed
 * characters a model cannot see (zero-width characters, non-breaking or other unusual spaces,
 * lookalike hyphens). Copying such a block by retyping corrupts it; `copy_lines` copies it byte for
 * byte. Single lines are never checked, so intentional character fixes are unaffected.
 */

const MIN_LINES = 3;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCES = 20;

const INVISIBLE_RE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
const SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const HYPHEN_RE = /[\u2010-\u2015\u2212\uFE63\uFF0D]/g;

function canonical(line: string): string {
	return line.replace(INVISIBLE_RE, "").replace(SPACE_RE, " ").replace(HYPHEN_RE, "-");
}

function codePoint(ch: string | undefined): string {
	if (ch === undefined) return "nothing";
	const cp = ch.codePointAt(0)!;
	return cp < 0x20 || cp > 0x7e ? `U+${cp.toString(16).toUpperCase().padStart(4, "0")}` : JSON.stringify(ch);
}

/** First differing character, described for the model. */
function describeDifference(original: string, retyped: string): string {
	const a = [...original];
	const b = [...retyped];
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return `${codePoint(a[i])} became ${codePoint(b[i])}`;
}

interface RetypedBlock {
	lines: string[];
	afterAnchor?: string;
	/** Lines of the edited file this edit replaces; a match there is an in-place rewrite, not a copy. */
	ownRange?: { start: number; end: number };
}

function lineOf(anchor: string): number {
	try {
		return parseLineRef(anchor).line;
	} catch {
		return 0;
	}
}

/** Inserted or replacement lines of an anchored edit, with the anchor a copy would go after. */
function retypedBlocks(edits: HashlineEditItem[]): RetypedBlock[] {
	const blocks: RetypedBlock[] = [];
	for (const edit of edits) {
		let text: string | undefined;
		let afterAnchor: string | undefined;
		let ownRange: RetypedBlock["ownRange"];
		if ("insert_after" in edit) {
			text = edit.insert_after.new_text || edit.insert_after.text;
			afterAnchor = edit.insert_after.anchor;
		} else if ("replace_lines" in edit) {
			text = edit.replace_lines.new_text;
			ownRange = { start: lineOf(edit.replace_lines.start_anchor), end: lineOf(edit.replace_lines.end_anchor) };
		} else if ("set_line" in edit) {
			text = edit.set_line.new_text;
			const line = lineOf(edit.set_line.anchor);
			ownRange = { start: line, end: line };
		}
		if (!text) continue;
		const lines = normalizeToLF(text).split("\n");
		while (lines.length && lines[0].trim() === "") lines.shift();
		while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
		if (lines.length >= MIN_LINES) blocks.push({ lines, afterAnchor, ownRange });
	}
	return blocks;
}

export interface RetypeFinding {
	message: string;
}

/**
 * Returns a refusal when an edit's new text retypes a block of `candidatePaths` (files the model
 * was shown) and changed invisible or lookalike characters in it.
 */
export async function findCorruptedRetype(input: {
	edits: HashlineEditItem[];
	absolutePath: string;
	currentContent: string;
	candidatePaths: string[];
	cwd: string;
}): Promise<RetypeFinding | undefined> {
	const blocks = retypedBlocks(input.edits);
	if (!blocks.length) return undefined;
	const sources: Array<{ path: string; lines: string[] }> = [{ path: input.absolutePath, lines: splitDisplayLines(input.currentContent) }];
	for (const path of input.candidatePaths.slice(-MAX_SOURCES)) {
		if (path === input.absolutePath) continue;
		try {
			const raw = await readFile(path);
			if (raw.length > MAX_SOURCE_BYTES) continue;
			sources.push({ path, lines: splitDisplayLines(normalizeToLF(stripBom(raw.toString("utf8")).text)) });
		} catch {
			// Unreadable or deleted: nothing to compare against.
		}
	}
	for (const block of blocks) {
		const wanted = block.lines.map(canonical);
		for (const source of sources) {
			const canonicalSource = source.lines.map(canonical);
			for (let start = 0; start + wanted.length <= canonicalSource.length; start++) {
				if (canonicalSource[start] !== wanted[0]) continue;
				if (!wanted.every((line, offset) => canonicalSource[start + offset] === line)) continue;
				const original = source.lines.slice(start, start + wanted.length);
				const changed = original.findIndex((line, offset) => line !== block.lines[offset]);
				if (changed === -1) continue; // byte-identical retype: harmless
				const first = start + 1;
				const last = start + wanted.length;
				const sameFile = source.path === input.absolutePath;
				const own = block.ownRange;
				// Rewriting the replaced lines themselves: any byte change there is deliberate.
				if (sameFile && own && own.start > 0 && own.end > 0 && first <= own.end && last >= own.start) continue;
				const anchorOf = (line: number) => `${line}:${computeLineHash(line, source.lines[line - 1])}`;
				const displayPath = relative(input.cwd, source.path) || source.path;
				const call = JSON.stringify({
					copy_lines: {
						...(sameFile ? {} : { from_path: displayPath }),
						start_anchor: anchorOf(first),
						end_anchor: anchorOf(last),
						after_anchor: block.afterAnchor ?? "LINE:HASH",
					},
				});
				return {
					message: [
						`Edit rejected — nothing was written. new_text retypes lines ${first}-${last} of ${displayPath}, but changes characters you cannot see: on line ${start + changed + 1}, ${describeDifference(original[changed], block.lines[changed])}.`,
						`To copy those lines exactly, use ${call}.`,
						"If the change is intended, copy the lines first and then edit that line on its own.",
					].join("\n"),
				};
			}
		}
	}
	return undefined;
}

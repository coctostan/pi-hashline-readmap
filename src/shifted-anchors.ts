import { computeLineHash, parseLineRef, type HashlineEditItem } from "./hashline.js";
import type { PtcLine } from "./ptc-value.js";
import { formatStaleRows, type ServedLines } from "./served-lines.js";

/**
 * Anchors from a view taken before this tool's own write to the same file may name a line that
 * has since moved. Rewrite them to the line they moved to when that is unambiguous.
 */
export type ShiftedAnchorResult =
	| { ok: true; edits: HashlineEditItem[]; notes: string[] }
	| { ok: false; message: string; rows: PtcLine[] };

interface ShiftRefusal {
	line: number;
	hash: string;
	/** Line the anchor's line moved to, or null when it was replaced, removed, or is ambiguous. */
	target: number | null;
	/** Overrides the default explanation. */
	reason?: string;
}

export function remapShiftedAnchors(input: {
	served: ServedLines | undefined;
	path: string;
	/** Current file lines (LF-normalized). */
	currentLines: readonly string[];
	edits: HashlineEditItem[];
}): ShiftedAnchorResult {
	const { served, path, currentLines } = input;
	if (!served) return { ok: true, edits: input.edits, notes: [] };
	const notes = new Set<string>();
	const refusals = new Map<string, ShiftRefusal>();
	let changed = false;

	const hashAt = (line: number): string | undefined => {
		const raw = currentLines[line - 1];
		return raw === undefined ? undefined : computeLineHash(line, raw);
	};

	const remap = (anchor: string): string => {
		if (typeof anchor !== "string") return anchor;
		let ref: { line: number; hash: string };
		try {
			ref = parseLineRef(anchor);
		} catch {
			return anchor;
		}
		if (ref.line === 0) return anchor;
		const target = served.shiftedAnchor(path, ref.line, ref.hash);
		if (target === undefined) return anchor;
		if (target === null || hashAt(ref.line) === ref.hash) {
			refusals.set(`${ref.line}:${ref.hash}`, { line: ref.line, hash: ref.hash, target });
			return anchor;
		}
		// Target changed on disk since our write: let normal validation decide.
		if (hashAt(target) !== ref.hash) return anchor;
		notes.add(`Anchor ${ref.line}:${ref.hash} predates an earlier edit that moved its line; remapped to ${target}:${ref.hash}.`);
		changed = true;
		return `${target}:${ref.hash}`;
	};

	const edits = input.edits.map((edit) => remapEditAnchors(edit, remap));

	// A range whose endpoints remapped by different amounts would silently change size.
	input.edits.forEach((edit, index) => {
		const requested = rangeAnchors(edit);
		const remapped = rangeAnchors(edits[index]);
		if (!requested || !remapped) return;
		const [oldStart, oldEnd] = requested.map(anchorLine);
		const [newStart, newEnd] = remapped.map(anchorLine);
		if (oldStart === undefined || oldEnd === undefined || newStart === undefined || newEnd === undefined) return;
		if (newEnd - newStart === oldEnd - oldStart) return;
		refusals.set(`range:${requested[0]}..${requested[1]}`, {
			line: oldStart,
			hash: parseLineRef(requested[0]).hash,
			target: newEnd,
			reason: `Range ${requested[0]}..${requested[1]} spans lines an earlier edit inserted or removed, so its old extent no longer matches the file.`,
		});
	});

	if (refusals.size) return refuseShiftedAnchors(currentLines, [...refusals.values()]);
	return { ok: true, edits: changed ? edits : input.edits, notes: [...notes] };
}

/** Start/end anchors of a range edit on the edited file. */
function rangeAnchors(edit: HashlineEditItem): [string, string] | undefined {
	if ("replace_lines" in edit) return [edit.replace_lines.start_anchor, edit.replace_lines.end_anchor];
	if ("copy_lines" in edit && !edit.copy_lines.from_path?.trim()) return [edit.copy_lines.start_anchor, edit.copy_lines.end_anchor];
	if ("move_lines" in edit && !edit.move_lines.from_path?.trim()) return [edit.move_lines.start_anchor, edit.move_lines.end_anchor];
	return undefined;
}

function anchorLine(anchor: string): number | undefined {
	try {
		const line = parseLineRef(anchor).line;
		return line > 0 ? line : undefined;
	} catch {
		return undefined;
	}
}

function refuseShiftedAnchors(currentLines: readonly string[], refusals: readonly ShiftRefusal[]): ShiftedAnchorResult {
	const marked = new Map<number, string>();
	for (const { line, target } of refusals) {
		for (const candidate of [line, target]) {
			if (candidate !== null && candidate >= 1 && candidate <= currentLines.length) marked.set(candidate, currentLines[candidate - 1]);
		}
	}
	const feedback = formatStaleRows(
		currentLines,
		[...marked].map(([line, raw]) => ({ line, hash: computeLineHash(line, raw), raw })),
	);
	const reasons = refusals.map(({ line, hash, target, reason }) =>
		reason ??
		(target === null
			? `Anchor ${line}:${hash} points at a line an earlier edit to this file replaced or removed, or one that cannot be mapped unambiguously.`
			: `Anchor ${line}:${hash} predates an earlier edit that moved its line to ${target}, and line ${line} now holds identical content, so it is ambiguous.`),
	);
	return {
		ok: false,
		rows: feedback.rows,
		message: [
			"Edit rejected — nothing was written.",
			...reasons,
			"Current rows (>>> marks the lines involved):",
			"",
			feedback.text,
			"",
			"Re-issue the edit with these LINE:HASH anchors; no re-read is needed.",
		].join("\n"),
	};
}

/** Apply `map` to every anchor of `edit` that names a line of the edited file. */
function remapEditAnchors(edit: HashlineEditItem, map: (anchor: string) => string): HashlineEditItem {
	if ("set_line" in edit) return { set_line: { ...edit.set_line, anchor: map(edit.set_line.anchor) } };
	if ("replace_lines" in edit) {
		return {
			replace_lines: {
				...edit.replace_lines,
				start_anchor: map(edit.replace_lines.start_anchor),
				end_anchor: map(edit.replace_lines.end_anchor),
			},
		};
	}
	if ("insert_after" in edit) return { insert_after: { ...edit.insert_after, anchor: map(edit.insert_after.anchor) } };
	if ("copy_lines" in edit) {
		const local = !edit.copy_lines.from_path?.trim();
		return {
			copy_lines: {
				...edit.copy_lines,
				after_anchor: map(edit.copy_lines.after_anchor),
				...(local ? { start_anchor: map(edit.copy_lines.start_anchor), end_anchor: map(edit.copy_lines.end_anchor) } : {}),
			},
		};
	}
	if ("move_lines" in edit) {
		const local = !edit.move_lines.from_path?.trim();
		return {
			move_lines: {
				...edit.move_lines,
				after_anchor: map(edit.move_lines.after_anchor),
				...(local ? { start_anchor: map(edit.move_lines.start_anchor), end_anchor: map(edit.move_lines.end_anchor) } : {}),
			},
		};
	}
	return edit;
}

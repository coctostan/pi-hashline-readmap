import { dropMarker, outputLines, type Drop } from "./drops.ts";

const GIT_COMMANDS = ["git diff", "git status", "git log", "git show", "git stash"];

export function isGitCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	const cmdLower = command.toLowerCase();
	return GIT_COMMANDS.some((gc) => cmdLower.startsWith(gc));
}

export function compactDiff(output: string, maxLines: number = 100, drops: Drop[] = []): string {
	const lines = outputLines(output);
	// No file diff to compact (`--stat`, `--name-only`, `--cc`): pass it through.
	if (!lines.some((line) => line.startsWith("diff --git"))) return output;
	const result: string[] = [];
	let currentFile = "";
	let added = 0;
	let removed = 0;
	let inHunk = false;
	const maxContextPerSide = 3;
	// Per-hunk accumulators
	let hunkChangeLines: string[] = [];   // +/- lines plus interstitial context
	let hunkPreContext: string[] = [];    // context before first change
	let hunkPostContext: string[] = [];   // context after last change
	let seenChanges = false;
	// Output index of each context marker → the context lines it cut; the line cap may cut a marker in turn.
	const contextCuts = new Map<number, number>();

	function flushHunk() {
		if (hunkChangeLines.length === 0 && hunkPreContext.length === 0) return;
		if (hunkPreContext.length > maxContextPerSide) {
			contextCuts.set(result.length, hunkPreContext.length - maxContextPerSide);
			result.push(`  ... (${hunkPreContext.length - maxContextPerSide} context lines)`);
			hunkPreContext = hunkPreContext.slice(-maxContextPerSide);
		}
		for (const l of hunkPreContext) result.push(`  ${l}`);
		for (const l of hunkChangeLines) result.push(`  ${l}`);
		const postShow = hunkPostContext.slice(0, maxContextPerSide);
		for (const l of postShow) result.push(`  ${l}`);
		if (hunkPostContext.length > maxContextPerSide) {
			contextCuts.set(result.length, hunkPostContext.length - maxContextPerSide);
			result.push(`  ... (${hunkPostContext.length - maxContextPerSide} context lines)`);
		}
		hunkChangeLines = [];
		hunkPreContext = [];
		hunkPostContext = [];
		seenChanges = false;
	}
	for (const line of lines) {
		// New file
		if (line.startsWith("diff --git")) {
			flushHunk();
			if (currentFile && (added > 0 || removed > 0)) {
				result.push(`  +${added} -${removed}`);
			}
			const match = line.match(/diff --git a\/(.+) b\/(.+)/);
			// A header the pattern can't read (git C-quotes paths holding tabs or non-ASCII) is kept as printed.
			currentFile = match ? match[2] : line;
			result.push("", `📄 ${currentFile}`);
			added = 0;
			removed = 0;
			inHunk = false;
			continue;
		}
		// Hunk header
		if (line.startsWith("@@")) {
			flushHunk();
			inHunk = true;
			const hunkInfo = line.match(/@@ .+ @@/)?.[0] || "@@";
			result.push(`  ${hunkInfo}`);
			continue;
		}
		// A no-newline marker is metadata both inside and outside a hunk.
		if (line === "\\ No newline at end of file") {
			continue;
		}

		// Before a file's first hunk, `index` and the `---`/`+++` file headers are noise; any other line (a rename, a
		// mode, a binary change, git's own warning) is kept. Inside a hunk, ---... and +++... are change records.
		if (!inHunk) {
			if (!/^(?:index |--- |\+\+\+ )/.test(line)) result.push(currentFile ? `  ${line}` : line);
			continue;
		}
		// Hunk content
		if (line.startsWith("+") || line.startsWith("-")) {
			if (line.startsWith("+")) added++;
			else removed++;
			// If we had post-context and hit more changes, that context
			// is interstitial — add it inline
			if (hunkPostContext.length > 0) {
				for (const c of hunkPostContext) hunkChangeLines.push(c);
				hunkPostContext = [];
			}
			hunkChangeLines.push(line);
			seenChanges = true;
		} else if (seenChanges) {
			hunkPostContext.push(line);
		} else {
			hunkPreContext.push(line);
		}
	}

	flushHunk();
	// Flush last file stats
	if (currentFile && (added > 0 || removed > 0)) {
		result.push(`  +${added} -${removed}`);
	}

	const reportContextCuts = (keep: (i: number) => boolean) => {
		for (const [i, count] of contextCuts) if (keep(i)) drops.push({ count, unit: "context lines" });
	};

	// Apply maxLines cap
	if (result.length <= maxLines) {
		reportContextCuts(() => true);
		return result.join("\n");
	}

	// Replaces result[start, end) with the cap's marker; a context marker inside the cut is counted by it, not reported.
	const cut = (start: number, end: number): string => {
		reportContextCuts((i) => i < start);
		const marker = dropMarker(drops, end - start, "lines", `... and ${end - start} more lines`);
		reportContextCuts((i) => i >= end);
		return [...result.slice(0, start), marker, ...result.slice(end)].join("\n");
	};

	// Identify change lines vs structural lines in the output
	const changeLineIndices: number[] = [];
	for (let i = 0; i < result.length; i++) {
		const trimmed = result[i].trimStart();
		if (trimmed.startsWith("+") || trimmed.startsWith("-")) {
			// But not file stats like "+5 -3"
			if (!trimmed.match(/^\+\d+ -\d+$/)) {
				changeLineIndices.push(i);
			}
		}
	}

	// How many change lines must we cut to fit under maxLines?
	const overBudget = result.length - maxLines;
	if (overBudget <= 0 || changeLineIndices.length <= overBudget) {
		// Fallback: simple first/last truncation
		const halfBudget = Math.floor((maxLines - 1) / 2);
		return cut(halfBudget, result.length - halfBudget);
	}

	// Remove middle change lines, keep first N and last N change lines
	const keepCount = changeLineIndices.length - overBudget;
	const keepFirst = Math.ceil(keepCount / 2);
	const keepLast = keepCount - keepFirst;
	const cutStart = changeLineIndices[keepFirst];
	const cutEnd = changeLineIndices[changeLineIndices.length - keepLast - 1];
	return cut(cutStart, cutEnd + 1);
}

const SHORT_STATUS_CODES = new Set([" ", "M", "A", "D", "R", "C", "U", "T", "?", "!"]);
// The unmerged pairs of git-status(1)'s short-format table: a conflict, whatever its index code.
const UNMERGED_STATUSES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

function isRecognizedShortStatusLine(line: string): boolean {
	if (line.startsWith("## ")) {
		return line.length > 3;
	}

	if (line.length < 4 || line[2] !== " " || line.includes("\0")) {
		return false;
	}

	const status = line.slice(0, 2);
	return status !== "  " && Array.from(status).every((code) => SHORT_STATUS_CODES.has(code));
}

export function compactStatus(output: string, drops: Drop[] = []): string {
	const lines = output.split("\n");

	if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === "")) {
		return "Clean working tree";
	}

	const contentLines = lines.filter((line) => line !== "");
	if (contentLines.length === 0 || !contentLines.every(isRecognizedShortStatusLine)) {
		return output;
	}

	const staged: string[] = [];
	const modified: string[] = [];
	const untracked: string[] = [];
	const ignored: string[] = [];
	const conflicts: string[] = [];

	let branchName = "";

	for (const line of lines) {
		// The branch line, tracking included (`main...origin/main [ahead 1]`)
		if (line.startsWith("##")) {
			branchName = line.slice(3);
			continue;
		}

		if (line.length < 3) {
			continue;
		}

		const status = line.slice(0, 2);
		const filename = line.slice(3);

		if (UNMERGED_STATUSES.has(status)) conflicts.push(line);
		else if (status === "??") untracked.push(filename);
		else if (status === "!!") ignored.push(filename);
		else {
			// Any other code is a change: in the index on the left, in the worktree (` T`, ` A` intent to add) on the right.
			if (status[0] !== " ") staged.push(filename);
			if (status[1] !== " ") modified.push(filename);
		}
	}

	let result = `📌 ${branchName}\n`;
	const sections: [title: string, files: string[], budget: number][] = [
		["✅ Staged", staged, 5],
		["📝 Modified", modified, 5],
		["❓ Untracked", untracked, 3],
		["🚫 Ignored", ignored, 3],
	];
	for (const [title, files, budget] of sections) {
		if (files.length === 0) continue;
		result += `${title}: ${files.length} files\n`;
		for (const file of files.slice(0, budget)) result += `  ${file}\n`;
		if (files.length > budget) {
			result += `${dropMarker(drops, files.length - budget, "files", `  ... and ${files.length - budget} more files`)}\n`;
		}
	}

	// No budget: every conflict is listed, its code naming each side.
	if (conflicts.length > 0) {
		result += `⚠️ Conflicts: ${conflicts.length} files\n`;
		for (const line of conflicts) {
			result += `  ${line}\n`;
		}
	}

	return result.trim();
}

// `commit [<>=+-] <sha>` at column 0, or `commit <sha>` after a `--graph` prefix ending in the commit's node (`*`, `<`,
// `>`, `o`); git abbreviates a sha to no fewer than 4 digits. A body line puts 4 or more spaces before its text
// (`    commit 1234567`, `|     * commit 1234567`), so the graph before a node may hold no run of 4 spaces.
// shortcut: a graph with two adjacent blank columns before a node reads as a body line, upgrade if such a graph turns up.
const LOG_COMMIT_HEADER = /^(?:(?:[|/\\]| (?! {3}))*[*<>o][-.|/\\ ]*)?commit (?:[<>=+-] )?[0-9a-f]{4,64}\b/;

/** Keeps the first `limit` whole commits, or `limit` lines of output with no commit header (`--oneline`, `--format`). */
export function compactLog(output: string, limit: number = 20, drops: Drop[] = []): string {
	const lines = outputLines(output);
	const headers = lines.flatMap((line, i) => (LOG_COMMIT_HEADER.test(line) ? [i] : []));
	if (headers.length > 0) {
		if (headers.length <= limit) return output;
		const marker = dropMarker(drops, headers.length - limit, "commits", `... and ${headers.length - limit} more commits`);
		return [...lines.slice(0, headers[limit]), marker].join("\n");
	}

	if (lines.length <= limit) return output;
	const marker = dropMarker(drops, lines.length - limit, "lines", `... and ${lines.length - limit} more lines`);
	return [...lines.slice(0, limit), marker].join("\n");
}

export function compactGitOutput(
	output: string,
	command: string | undefined | null,
	drops: Drop[] = [],
): string | null {
	if (typeof command !== "string" || !isGitCommand(command)) {
		return null;
	}

	const cmdLower = command.toLowerCase();

	if (cmdLower.startsWith("git diff")) {
		const compacted = compactDiff(output, undefined, drops);
		return compacted === output ? null : compacted;
	}

	if (cmdLower.startsWith("git status")) {
		const compacted = compactStatus(output, drops);
		return compacted === output ? null : compacted;
	}

	if (cmdLower.startsWith("git log")) {
		return compactLog(output, undefined, drops);
	}

	return null;
}

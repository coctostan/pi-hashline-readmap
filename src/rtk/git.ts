const GIT_COMMANDS = ["git diff", "git status", "git log", "git show", "git stash"];

export function isGitCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	const cmdLower = command.toLowerCase();
	return GIT_COMMANDS.some((gc) => cmdLower.startsWith(gc));
}

export function compactDiff(output: string, maxLines: number = 100): string {
	const lines = output.split("\n");
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

	function flushHunk() {
		if (hunkChangeLines.length === 0 && hunkPreContext.length === 0) return;
		if (hunkPreContext.length > maxContextPerSide) {
			result.push(`  ... (${hunkPreContext.length - maxContextPerSide} context lines)`);
			hunkPreContext = hunkPreContext.slice(-maxContextPerSide);
		}
		for (const l of hunkPreContext) result.push(`  ${l}`);
		for (const l of hunkChangeLines) result.push(`  ${l}`);
		const postShow = hunkPostContext.slice(0, maxContextPerSide);
		for (const l of postShow) result.push(`  ${l}`);
		if (hunkPostContext.length > maxContextPerSide) {
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
			currentFile = match ? match[2] : "unknown";
			result.push(`\n📄 ${currentFile}`);
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
		// Skip diff meta lines
		if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("\\\\")) {
			continue;
		}
		// Hunk content
		if (inHunk) {
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
			} else {
				// Context line
				if (seenChanges) {
					hunkPostContext.push(line);
				} else {
					hunkPreContext.push(line);
				}
			}
		}
	}

	flushHunk();
	// Flush last file stats
	if (currentFile && (added > 0 || removed > 0)) {
		result.push(`  +${added} -${removed}`);
	}

	// Apply maxLines cap
	if (result.length <= maxLines) {
		return result.join("\n");
	}

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
		const head = result.slice(0, halfBudget);
		const tail = result.slice(result.length - halfBudget);
		const omitted = result.length - halfBudget * 2;
		return [...head, `  ... +${omitted} more changes`, ...tail].join("\n");
	}

	// Remove middle change lines, keep first N and last N change lines
	const keepCount = changeLineIndices.length - overBudget;
	const keepFirst = Math.ceil(keepCount / 2);
	const keepLast = keepCount - keepFirst;
	const cutStart = changeLineIndices[keepFirst];
	const cutEnd = changeLineIndices[changeLineIndices.length - keepLast - 1];
	const omitted = cutEnd - cutStart + 1;

	const head = result.slice(0, cutStart);
	const tail = result.slice(cutEnd + 1);
	return [...head, `  ... +${omitted} more changes`, ...tail].join("\n");
}

interface StatusStats {
	staged: number;
	modified: number;
	untracked: number;
	conflicts: number;
	stagedFiles: string[];
	modifiedFiles: string[];
	untrackedFiles: string[];
}

export function compactStatus(output: string): string {
	const lines = output.split("\n");

	if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === "")) {
		return "Clean working tree";
	}

	const stats: StatusStats = {
		staged: 0,
		modified: 0,
		untracked: 0,
		conflicts: 0,
		stagedFiles: [],
		modifiedFiles: [],
		untrackedFiles: [],
	};

	let branchName = "";

	for (const line of lines) {
		// Extract branch name from first line
		if (line.startsWith("##")) {
			const match = line.match(/## (.+)/);
			if (match) {
				branchName = match[1].split("...")[0];
			}
			continue;
		}

		if (line.length < 3) {
			continue;
		}

		const status = line.slice(0, 2);
		const filename = line.slice(3);

		// Parse two-character status
		const indexStatus = status[0];
		const worktreeStatus = status[1];

		if (["M", "A", "D", "R", "C"].includes(indexStatus)) {
			stats.staged++;
			stats.stagedFiles.push(filename);
		}

		if (indexStatus === "U") {
			stats.conflicts++;
		}

		if (["M", "D"].includes(worktreeStatus)) {
			stats.modified++;
			stats.modifiedFiles.push(filename);
		}

		if (status === "??") {
			stats.untracked++;
			stats.untrackedFiles.push(filename);
		}
	}

	// Build summary
	let result = `📌 ${branchName}\n`;

	if (stats.staged > 0) {
		result += `✅ Staged: ${stats.staged} files\n`;
		const shown = stats.stagedFiles.slice(0, 5);
		for (const file of shown) {
			result += `  ${file}\n`;
		}
		if (stats.staged > 5) {
			result += `  ... +${stats.staged - 5} more\n`;
		}
	}

	if (stats.modified > 0) {
		result += `📝 Modified: ${stats.modified} files\n`;
		const shown = stats.modifiedFiles.slice(0, 5);
		for (const file of shown) {
			result += `  ${file}\n`;
		}
		if (stats.modified > 5) {
			result += `  ... +${stats.modified - 5} more\n`;
		}
	}

	if (stats.untracked > 0) {
		result += `❓ Untracked: ${stats.untracked} files\n`;
		const shown = stats.untrackedFiles.slice(0, 3);
		for (const file of shown) {
			result += `  ${file}\n`;
		}
		if (stats.untracked > 3) {
			result += `  ... +${stats.untracked - 3} more\n`;
		}
	}

	if (stats.conflicts > 0) {
		result += `⚠️  Conflicts: ${stats.conflicts} files\n`;
	}

	return result.trim();
}

export function compactLog(output: string, limit: number = 20): string {
	const lines = output.split("\n");
	const result: string[] = [];

	for (const line of lines.slice(0, limit)) {
		if (line.length > 80) {
			result.push(line.slice(0, 77) + "...");
		} else {
			result.push(line);
		}
	}

	if (lines.length > limit) {
		result.push(`... and ${lines.length - limit} more commits`);
	}

	return result.join("\n");
}

export function compactGitOutput(
	output: string,
	command: string | undefined | null
): string | null {
	if (typeof command !== "string" || !isGitCommand(command)) {
		return null;
	}

	const cmdLower = command.toLowerCase();

	if (cmdLower.startsWith("git diff")) {
		return compactDiff(output);
	}

	if (cmdLower.startsWith("git status")) {
		return compactStatus(output);
	}

	if (cmdLower.startsWith("git log")) {
		return compactLog(output);
	}

	return null;
}

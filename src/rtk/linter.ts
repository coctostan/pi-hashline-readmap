const LINTER_COMMANDS = [
	"eslint",
	"prettier",
	"ruff",
	"pylint",
	"mypy",
	"flake8",
	"black",
	"clippy",
	"golangci-lint",
];

interface Issue {
	severity: "ERROR" | "WARNING";
	rule: string;
	file: string;
	line?: number;
	message: string;
}

export function isLinterCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	const cmdLower = command.toLowerCase();
	return LINTER_COMMANDS.some((lc) => cmdLower.includes(lc));
}

function parseIssues(output: string, linterType: string): Issue[] {
	const issues: Issue[] = [];
	const lines = output.split("\n");

	for (const line of lines) {
		const issue = parseLine(line, linterType);
		if (issue) {
			issues.push(issue);
		}
	}

	return issues;
}

function parseLine(line: string, linterType: string): Issue | null {
	// ESLint: /path/to/file.js:10:5: Error message [rule-id]
	// Ruff: /path/to/file.py:10:5: E501 Error message
	// Pylint: /path/to/file.py:10:5: E0001: Error message (rule-id)
	// Clippy: error: message at src/main.rs:10:5

	const patterns = [
		// file:line:col: message [rule]
		{
			pattern: /^(.+):(\d+):(\d+):\s*(.+)$/,
			extract: (match: RegExpMatchArray) => ({
				file: match[1],
				line: parseInt(match[2], 10),
				content: match[4],
				severity: undefined as string | undefined,
				message: undefined as string | undefined,
			}),
		},
		// error: message at file:line:col
		{
			pattern: /^(error|warning):\s*(.+?)\s+at\s+(.+):(\d+):(\d+)$/,
			extract: (match: RegExpMatchArray) => ({
				severity: match[1].toUpperCase() as "ERROR" | "WARNING",
				message: match[2],
				file: match[3],
				line: parseInt(match[4], 10),
				content: match[2],
			}),
		},
	];

	for (const { pattern, extract } of patterns) {
		const match = line.match(pattern);
		if (match) {
			const extracted = extract(match);
			return {
				severity: (extracted.severity || "ERROR") as "ERROR" | "WARNING",
				rule: extracted.content?.match(/\[(.+?)\]$/)?.[1] || "unknown",
				file: extracted.file,
				line: extracted.line,
				message: extracted.content || extracted.message || line,
			};
		}
	}

	return null;
}

export function aggregateLinterOutput(
	output: string,
	command: string | undefined | null
): string | null {
	if (typeof command !== "string" || !isLinterCommand(command)) {
		return null;
	}

	// Detect linter type from command
	const linterType = detectLinterType(command);

	// Parse issues
	const issues = parseIssues(output, linterType);

	if (issues.length === 0) {
		return `✓ ${linterType}: No issues found`;
	}

	// Count by severity
	const errors = issues.filter((i) => i.severity === "ERROR").length;
	const warnings = issues.filter((i) => i.severity === "WARNING").length;

	// Group by rule
	const byRule = new Map<string, number>();
	for (const issue of issues) {
		byRule.set(issue.rule, (byRule.get(issue.rule) || 0) + 1);
	}

	// Group by file
	const byFile = new Map<string, Issue[]>();
	for (const issue of issues) {
		const existing = byFile.get(issue.file) || [];
		existing.push(issue);
		byFile.set(issue.file, existing);
	}

	// Build output
	let result = `${linterType}: ${errors} errors, ${warnings} warnings in ${byFile.size} files\n`;
	result += "═══════════════════════════════════════\n";

	// Top rules
	const sortedRules = Array.from(byRule.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);
	result += "Top rules:\n";
	for (const [rule, count] of sortedRules) {
		result += `  ${rule} (${count}x)\n`;
	}

	// Top files
	result += "\nTop files:\n";
	const sortedFiles = Array.from(byFile.entries())
		.sort((a, b) => b[1].length - a[1].length)
		.slice(0, 10);

	for (const [file, fileIssues] of sortedFiles) {
		const compact = compactPath(file, 40);
		result += `  ${compact} (${fileIssues.length} issues)\n`;

		// Show top 3 rules per file
		const fileRules = new Map<string, number>();
		for (const issue of fileIssues) {
			fileRules.set(issue.rule, (fileRules.get(issue.rule) || 0) + 1);
		}

		const sortedFileRules = Array.from(fileRules.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3);

		for (const [rule, count] of sortedFileRules) {
			result += `    ${rule} (${count})\n`;
		}
	}

	return result;
}

function detectLinterType(command: string): string {
	const cmdLower = command.toLowerCase();
	if (cmdLower.includes("eslint")) return "ESLint";
	if (cmdLower.includes("ruff")) return "Ruff";
	if (cmdLower.includes("pylint")) return "Pylint";
	if (cmdLower.includes("mypy")) return "MyPy";
	if (cmdLower.includes("flake8")) return "Flake8";
	if (cmdLower.includes("clippy")) return "Clippy";
	if (cmdLower.includes("golangci")) return "GolangCI-Lint";
	if (cmdLower.includes("prettier")) return "Prettier";
	return "Linter";
}

function compactPath(path: string, maxLength: number): string {
	if (path.length <= maxLength) {
		return path;
	}

	const parts = path.split("/");
	if (parts.length <= 3) {
		return path;
	}

	return `${parts[0]}/.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

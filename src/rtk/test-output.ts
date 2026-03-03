interface TestSummary {
	passed: number;
	failed: number;
	skipped: number;
	failures: string[];
}

const TEST_COMMANDS = [
	"test",
	"jest",
	"vitest",
	"pytest",
	"cargo test",
	"bun test",
	"go test",
	"mocha",
	"ava",
	"tap",
];

const TEST_RESULT_PATTERNS = [
	/test result:\s*(\w+)\.\s*(\d+)\s*passed;\s*(\d+)\s*failed;/,
	/(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?/i,
	/(\d+)\s*pass(?:,\s*(\d+)\s*fail)?(?:,\s*(\d+)\s*skip)?/i,
	/tests?:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?/i,
];

export function isTestCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	// Only examine the command name and subcommands — stop at the first flag
	// or quoted arg so that words like "test" in commit messages or file paths
	// don't cause false positives (e.g. jj describe -m "...failing tests...").
	const tokens = command.toLowerCase().split(/\s+/);
	const firstFlagIdx = tokens.findIndex((t) => t.startsWith("-") || t.startsWith('"') || t.startsWith("'"));
	const cmdBase = (firstFlagIdx === -1 ? tokens : tokens.slice(0, firstFlagIdx)).join(" ");

	return TEST_COMMANDS.some((tc) => cmdBase.includes(tc.toLowerCase()));
}

function extractTestStats(output: string): Partial<TestSummary> {
	const summary: Partial<TestSummary> = {};
	for (const pattern of TEST_RESULT_PATTERNS) {
		const match = output.match(pattern);
		if (match) {
			summary.passed = parseInt(match[1], 10) || 0;
			summary.failed = parseInt(match[2], 10) || 0;
			summary.skipped = parseInt(match[3], 10) || 0;
			break;
		}
	}
	// Scan for failure count separately to handle "N failed, M passed" ordering
	// (e.g. vitest: "1 failed | 2 passed") that the combined patterns miss.
	if (!summary.failed) {
		const failMatch = output.match(/(\d+)\s*failed/i);
		if (failMatch) {
			summary.failed = parseInt(failMatch[1], 10);
		}
	}
	return summary;
}

export function aggregateTestOutput(
	output: string,
	command: string | undefined | null
): string | null {
	if (typeof command !== "string" || !isTestCommand(command)) {
		return null;
	}
	// "| cat" is the universal escape hatch — raw output, no compression
	if (command.includes("| cat")) {
		return null;
	}

	const lines = output.split("\n");
	const summary: TestSummary = {
		passed: 0,
		failed: 0,
		skipped: 0,
		failures: [],
	};

	// Extract stats from output
	const stats = extractTestStats(output);
	summary.passed = stats.passed || 0;
	summary.failed = stats.failed || 0;
	summary.skipped = stats.skipped || 0;

	// Fallback: count passes/fails manually if no stats found
	if (summary.passed === 0 && summary.failed === 0) {
		for (const line of lines) {
			if (line.match(/\b(ok|PASS|✓|✔)\b/)) summary.passed++;
			if (line.match(/\b(FAIL|fail|✗|✕)\b/)) summary.failed++;
		}
	}

	// When tests fail, the implementer needs the full error output —
	// stack traces, assertion diffs, TypeScript errors — not a truncated
	// summary. Return the raw stripped output so nothing is hidden.
	if (summary.failed > 0) {
		const MAX_CHARS = 8000;
		if (output.length <= MAX_CHARS) {
			return output;
		}
		// Keep the tail — vitest/jest put error details and summary at the end
		const tail = output.slice(-MAX_CHARS);
		const firstNewline = tail.indexOf("\n");
		const trimmedTail = firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail;
		return `... (output truncated, showing last ${MAX_CHARS} chars)\n${trimmedTail}`;
	}

	// All passing — compress to a brief summary so we don't flood context
	// with hundreds of "✓ test name" lines.
	const result: string[] = ["📋 Test Results:"];
	result.push(`   ✅ ${summary.passed} passed`);
	if (summary.skipped > 0) {
		result.push(`   ⏭️  ${summary.skipped} skipped`);
	}
	return result.join("\n");
}

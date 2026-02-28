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

const FAILURE_START_PATTERNS = [
	/^FAIL\s+/,
	/^FAILED\s+/,
	/^\s*●\s+/,
	/^\s*✕\s+/,
	/test\s+\w+\s+\.\.\.\s*FAILED/,
	/thread\s+'\w+'\s+panicked/,
];

export function isTestCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	const cmdLower = command.toLowerCase();
	return TEST_COMMANDS.some((tc) => cmdLower.includes(tc.toLowerCase()));
}

function isFailureStart(line: string): boolean {
	return FAILURE_START_PATTERNS.some((pattern) => pattern.test(line));
}

function extractTestStats(output: string): Partial<TestSummary> {
	const summary: Partial<TestSummary> = {};

	for (const pattern of TEST_RESULT_PATTERNS) {
		const match = output.match(pattern);
		if (match) {
			summary.passed = parseInt(match[1], 10) || 0;
			summary.failed = parseInt(match[2], 10) || 0;
			summary.skipped = parseInt(match[3], 10) || 0;
			return summary;
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

	// Extract failure details if tests failed
	if (summary.failed > 0) {
		let inFailure = false;
		let currentFailure: string[] = [];
		let blankCount = 0;

		for (const line of lines) {
			if (isFailureStart(line)) {
				if (inFailure && currentFailure.length > 0) {
					summary.failures.push(currentFailure.join("\n"));
				}
				inFailure = true;
				currentFailure = [line];
				blankCount = 0;
				continue;
			}

			if (inFailure) {
				if (line.trim() === "") {
					blankCount++;
					if (blankCount >= 2 && currentFailure.length > 3) {
						summary.failures.push(currentFailure.join("\n"));
						inFailure = false;
						currentFailure = [];
					} else {
						currentFailure.push(line);
					}
				} else if (line.match(/^\s/) || line.match(/^-/)) {
					// Continuation of failure
					currentFailure.push(line);
					blankCount = 0;
				} else {
					// End of failure block
					summary.failures.push(currentFailure.join("\n"));
					inFailure = false;
					currentFailure = [];
				}
			}
		}

		if (inFailure && currentFailure.length > 0) {
			summary.failures.push(currentFailure.join("\n"));
		}
	}

	// Format output
	const result: string[] = ["📋 Test Results:"];
	result.push(`   ✅ ${summary.passed} passed`);
	if (summary.failed > 0) {
		result.push(`   ❌ ${summary.failed} failed`);
	}
	if (summary.skipped > 0) {
		result.push(`   ⏭️  ${summary.skipped} skipped`);
	}

	if (summary.failed > 0 && summary.failures.length > 0) {
		result.push("\n   Failures:");
		for (const failure of summary.failures.slice(0, 5)) {
			const lines = failure.split("\n");
			const firstLine = lines[0];
			result.push(`   • ${firstLine.slice(0, 70)}${firstLine.length > 70 ? "..." : ""}`);
			for (const line of lines.slice(1, 4)) {
				if (line.trim()) {
					result.push(`     ${line.slice(0, 65)}${line.length > 65 ? "..." : ""}`);
				}
			}
			if (lines.length > 4) {
				result.push(`     ... (${lines.length - 4} more lines)`);
			}
		}
		if (summary.failures.length > 5) {
			result.push(`   ... and ${summary.failures.length - 5} more failures`);
		}
	}

	return result.join("\n");
}

interface BuildStats {
	compiled: number;
	errors: string[][];
	warnings: string[];
}

const BUILD_COMMAND_PATTERNS = [
	/^cargo\s+(?:build|check|test)(?:\s|$)/,
	/^bun\s+build(?:\s|$)/,
	/^npm\s+run\s+build(?:\s|$)/,
	/^yarn\s+(?:run\s+)?build(?:\s|$)/,
	/^pnpm\s+(?:run\s+)?build(?:\s|$)/,
	/^go\s+(?:build|install)(?:\s|$)/,
	/^python(?:3)?\s+setup\.py\s+build(?:\s|$)/,
	/^pip(?:3)?\s+install(?:\s|$)/,
];

const TSC_COMMAND_PATTERN = /^(?:(?:npx|bunx)\s+)?(?:[^\s]+[\\/])?tsc(?:\s|$)/;
const TSC_VERSION_PATTERN = /^(?:(?:npx|bunx)\s+)?(?:[^\s]+[\\/])?tsc\s+(?:--version|-v)(?:\s|$)/;
const LEADING_ENV_ASSIGNMENTS_PATTERN = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*/;

function normalizeBuildCommand(command: string): string {
	return command.trim().replace(LEADING_ENV_ASSIGNMENTS_PATTERN, "").toLowerCase();
}

const SKIP_PATTERNS = [
	/^\s*Compiling\s+/,
	/^\s*Checking\s+/,
	/^\s*Downloading\s+/,
	/^\s*Downloaded\s+/,
	/^\s*Fetching\s+/,
	/^\s*Fetched\s+/,
	/^\s*Updating\s+/,
	/^\s*Updated\s+/,
	/^\s*Building\s+/,
	/^\s*Generated\s+/,
	/^\s*Creating\s+/,
	/^\s*Running\s+/,
];

const ERROR_START_PATTERNS = [
	/^error\[/,
	/^error:/,
	/^\[ERROR\]/,
	/^FAIL/,
];

const WARNING_PATTERNS = [/^warning:/, /^\[WARNING\]/, /^warn:/];

function isSkipLine(line: string): boolean {
	return SKIP_PATTERNS.some((pattern) => pattern.test(line));
}

function isErrorStart(line: string): boolean {
	return ERROR_START_PATTERNS.some((pattern) => pattern.test(line));
}

function isWarning(line: string): boolean {
	return WARNING_PATTERNS.some((pattern) => pattern.test(line));
}

export function isBuildCommand(command: string | undefined | null): boolean {
	if (typeof command !== "string" || command.trim().length === 0) {
		return false;
	}

	const normalized = normalizeBuildCommand(command);
	if (TSC_VERSION_PATTERN.test(normalized)) return false;
	if (TSC_COMMAND_PATTERN.test(normalized)) return true;
	return BUILD_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function filterBuildOutput(
	output: string,
	command: string | undefined | null
): string | null {
	if (typeof command !== "string" || !isBuildCommand(command)) {
		return null;
	}

	const lines = output.split("\n");
	const stats: BuildStats = {
		compiled: 0,
		errors: [],
		warnings: [],
	};

	let inErrorBlock = false;
	let currentError: string[] = [];
	let blankCount = 0;

	for (const line of lines) {
		// Count compilation units
		if (line.match(/^\s*(Compiling|Checking|Building)\s+/)) {
			stats.compiled++;
			continue;
		}

		// Skip noise lines
		if (isSkipLine(line)) {
			continue;
		}

		// Detect errors
		if (isErrorStart(line)) {
			if (inErrorBlock && currentError.length > 0) {
				stats.errors.push([...currentError]);
			}
			inErrorBlock = true;
			currentError = [line];
			blankCount = 0;
			continue;
		}

		// Detect warnings
		if (isWarning(line)) {
			stats.warnings.push(line);
			continue;
		}

		// Track error block continuation
		if (inErrorBlock) {
			if (line.trim() === "") {
				blankCount++;
				if (blankCount >= 2 && currentError.length > 3) {
					stats.errors.push([...currentError]);
					inErrorBlock = false;
					currentError = [];
				} else {
					currentError.push(line);
				}
			} else if (line.match(/^\s/) || line.match(/^-->/)) {
				// Continuation of error
				currentError.push(line);
				blankCount = 0;
			} else {
				// End of error block
				stats.errors.push([...currentError]);
				inErrorBlock = false;
				currentError = [];
			}
		}
	}

	// Flush final error
	if (inErrorBlock && currentError.length > 0) {
		stats.errors.push(currentError);
	}

	// Format output
	if (stats.errors.length === 0 && stats.warnings.length === 0) {
		if (stats.compiled === 0) {
			return null;
		}
		return `✓ Build successful (${stats.compiled} units compiled)`;
	}

	const result: string[] = [];

	if (stats.errors.length > 0) {
		result.push(`❌ ${stats.errors.length} error(s):`);
		for (const error of stats.errors.slice(0, 5)) {
			result.push(...error.slice(0, 10));
			if (error.length > 10) {
				result.push("  ...");
			}
		}
		if (stats.errors.length > 5) {
			result.push(`... and ${stats.errors.length - 5} more errors`);
		}
	}

	if (stats.warnings.length > 0) {
		result.push(`\n⚠️  ${stats.warnings.length} warning(s)`);
	}

	return result.join("\n");
}

interface BuildStats {
	compiled: number;
	errors: string[][];
	warnings: string[];
}

const BUILD_COMMANDS = [
	"cargo build",
	"cargo check",
	"bun build",
	"npm run build",
	"yarn build",
	"pnpm build",
	"tsc",
	"make",
	"cmake",
	"gradle",
	"mvn",
	"go build",
	"go install",
	"python setup.py build",
	"pip install",
];

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
	if (typeof command !== "string" || command.length === 0) {
		return false;
	}

	const cmdLower = command.toLowerCase();
	return BUILD_COMMANDS.some((bc) => cmdLower.includes(bc.toLowerCase()));
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

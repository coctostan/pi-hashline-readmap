import { dropMarker, outputLines, type Drop } from "./drops.ts";

interface BuildStats {
	compiled: number;
	errors: string[][];
	warnings: string[][];
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
	/^\s*Finished\s+/,
	// cargo's per-package count of the warnings it printed above
	/^warning: .+ generated \d+ warnings?\b/,
];

const ERROR_START_PATTERNS = [
	/^error\[/,
	/^error:/,
	/^\[ERROR\]/,
	/^FAIL/,
];

const WARNING_PATTERNS = [
	/^warning:/,
	/^\[WARNING\]/,
	/^warn:/,
	/^\S.*\(\d+,\d+\): warning TS\d+:/,
	/^\S.*:\d+:\d+ - warning TS\d+:/,
];

// An indented line, a `-->` location, or a numbered source line (rustc's `2 |     let x = 5;`, tsc's `1 const x = 1;`).
const CONTINUATION_PATTERN = /^(?:\s|-->|\d+\s)/;

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
	command: string | undefined | null,
	drops: Drop[] = [],
): string | null {
	if (typeof command !== "string" || !isBuildCommand(command)) {
		return null;
	}

	const lines = outputLines(output);
	const stats: BuildStats = {
		compiled: 0,
		errors: [],
		warnings: [],
	};

	// The diagnostic being read: an entry of stats.errors or stats.warnings.
	let current: string[] | undefined;
	let blankCount = 0;
	// Lines outside any diagnostic that no noise pattern names, kept as printed (npm's `> build` echo, tsc's `Found N`).
	const other: string[] = [];

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

		const diagnostics = isErrorStart(line) ? stats.errors : isWarning(line) ? stats.warnings : undefined;
		if (diagnostics) {
			current = [line];
			diagnostics.push(current);
			blankCount = 0;
			continue;
		}

		if (current !== undefined) {
			if (line.trim() === "") {
				blankCount++;
				if (blankCount >= 2 && current.length > 3) current = undefined;
				else current.push(line);
				continue;
			}
			if (CONTINUATION_PATTERN.test(line)) {
				current.push(line);
				blankCount = 0;
				continue;
			}
			current = undefined;
		}
		if (line.trim() !== "") other.push(line);
	}

	// Format output
	if (stats.errors.length === 0 && stats.warnings.length === 0 && stats.compiled === 0) {
		return null;
	}

	const result: string[] = [];

	if (stats.errors.length === 0 && stats.compiled > 0) {
		result.push(`✓ Build successful (${stats.compiled} units compiled)`);
	}

	if (stats.errors.length > 0) {
		result.push(`❌ ${stats.errors.length} error(s):`, ...diagnosticLines(stats.errors, "errors", drops));
	}

	if (stats.warnings.length > 0) {
		if (stats.errors.length > 0) result.push("");
		result.push(`⚠️  ${stats.warnings.length} warning(s):`, ...diagnosticLines(stats.warnings, "warnings", drops));
	}

	if (other.length > 0) result.push("", ...other);

	return result.join("\n");
}

/** The first 5 diagnostics, 10 lines each, every cut ending in the marker that reports it. */
function diagnosticLines(diagnostics: string[][], unit: string, drops: Drop[]): string[] {
	const result: string[] = [];
	for (const diagnostic of diagnostics.slice(0, 5)) {
		// A blank line ending a diagnostic only separated it from the next; its start line is never blank.
		while (diagnostic[diagnostic.length - 1].trim() === "") diagnostic.pop();
		result.push(...diagnostic.slice(0, 10));
		if (diagnostic.length > 10) {
			result.push(dropMarker(drops, diagnostic.length - 10, "lines", `  ... and ${diagnostic.length - 10} more lines`));
		}
	}
	if (diagnostics.length > 5) {
		result.push(dropMarker(drops, diagnostics.length - 5, unit, `... and ${diagnostics.length - 5} more ${unit}`));
	}
	return result;
}

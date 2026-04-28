import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

const POSITIVE_BASE10_INT = /^[1-9][0-9]*$/;

/**
 * Strict positive base-10 integer parser used by hashline env knobs.
 *
 * Accepts: trimmed strings matching /^[1-9][0-9]*$/ that parse to a finite
 * positive integer.
 *
 * Rejects: undefined, empty, whitespace-only, "0", negative, signed, hex
 * ("0x10"), exponent ("1e3"), decimal ("3.14"), separators ("1,000" /
 * "1_000"), embedded whitespace ("5 5").
 *
 * Returns `undefined` on rejection; never throws.
 */
export function parsePositiveBase10Int(raw: string | undefined | null): number | undefined {
	if (raw === undefined || raw === null) return undefined;
	const trimmed = String(raw).trim();
	if (!POSITIVE_BASE10_INT.test(trimmed)) return undefined;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return parsed;
}

export interface GrepOutputBudget {
	maxLines: number;
	maxBytes: number;
}

/**
 * Effective grep-output ceilings used as clamp upper bounds and as the
 * fallback defaults when env vars are unset/invalid.
 *
 * The bytes ceiling is the already-tightened 50 KiB used by `buildGrepOutput`
 * today, NOT the unclamped `DEFAULT_MAX_BYTES`.
 */
export const GREP_OUTPUT_DEFAULT_MAX_LINES = DEFAULT_MAX_LINES;
export const GREP_OUTPUT_DEFAULT_MAX_BYTES = Math.min(DEFAULT_MAX_BYTES, 50 * 1024);

function resolveDimension(rawEnvValue: string | undefined, ceiling: number): number {
	const parsed = parsePositiveBase10Int(rawEnvValue);
	if (parsed === undefined) return ceiling;
	return Math.min(parsed, ceiling);
}

/**
 * Resolve the effective grep visible-output budget. Re-reads `process.env`
 * on every call (no memoization) so tests and long-lived agent sessions can
 * change the env vars dynamically.
 *
 * Invalid / zero / negative env values fall back to the current defaults.
 * Above-default values clamp to the current defaults. Below-default values
 * are used as-is.
 */
export function resolveGrepOutputBudget(): GrepOutputBudget {
	return {
		maxLines: resolveDimension(
			process.env.PI_HASHLINE_GREP_MAX_LINES,
			GREP_OUTPUT_DEFAULT_MAX_LINES,
		),
		maxBytes: resolveDimension(
			process.env.PI_HASHLINE_GREP_MAX_BYTES,
			GREP_OUTPUT_DEFAULT_MAX_BYTES,
		),
	};
}

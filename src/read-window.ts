import { coerceObviousBase10Int } from "./coerce-obvious-int.js";

export const DEFAULT_CHAR_LIMIT = 500;
export const MAX_CHAR_LIMIT = 10_000;

export interface CharWindow {
  /** Actual 0-based start (may be one less than requested when the request split a surrogate pair). */
  start: number;
  /** Exclusive end. */
  end: number;
  /** Total length of the display string. */
  total: number;
  remaining: number;
  nextCharOffset: number | null;
  text: string;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Pull `end` back by one when it falls between the halves of a surrogate pair. */
export function safeCharEnd(display: string, end: number): number {
  if (
    end > 0 &&
    end < display.length &&
    isHighSurrogate(display.charCodeAt(end - 1)) &&
    isLowSurrogate(display.charCodeAt(end))
  ) {
    return end - 1;
  }
  return end;
}

/**
 * Window over an already-escaped display string. Callers must validate `charOffset < display.length`
 * and `charLimit >= 1` first; out-of-range values are clamped rather than thrown.
 */
export function computeCharWindow(display: string, charOffset: number, charLimit: number): CharWindow {
  const total = display.length;
  let start = Math.min(Math.max(charOffset, 0), total);
  if (
    start > 0 &&
    start < total &&
    isLowSurrogate(display.charCodeAt(start)) &&
    isHighSurrogate(display.charCodeAt(start - 1))
  ) {
    start -= 1;
  }
  let end = safeCharEnd(display, Math.min(start + charLimit, total));
  if (end <= start && start < total) end = Math.min(start + 2, total);
  const remaining = total - end;
  return {
    start,
    end,
    total,
    remaining,
    nextCharOffset: remaining > 0 ? end : null,
    text: display.slice(start, end),
  };
}

export interface WindowRequest {
  charOffset: number;
  charLimit: number;
  /** True when the caller passed charLimit (used so rehydration only replays supplied params). */
  charLimitSupplied: boolean;
}

export type WindowParamsResult =
  | { ok: true; window: WindowRequest | null; adjustments: string[] }
  | { ok: false; code: "invalid-char-offset" | "invalid-char-limit"; message: string };

export function parseWindowParams(input: { charOffset?: unknown; charLimit?: unknown }): WindowParamsResult {
  const adjustments: string[] = [];
  const rawOffset = input.charOffset === "" ? undefined : input.charOffset;
  if (input.charOffset === "") adjustments.push("ignored empty charOffset");
  const rawLimit = input.charLimit === "" ? undefined : input.charLimit;
  if (input.charLimit === "") adjustments.push("ignored empty charLimit");

  const offset = coerceObviousBase10Int(rawOffset, "charOffset");
  if (!offset.ok) return { ok: false, code: "invalid-char-offset", message: offset.message };
  if (offset.value !== undefined && offset.value < 0) {
    return {
      ok: false,
      code: "invalid-char-offset",
      message: `Invalid charOffset: expected a non-negative integer, received ${offset.value}.`,
    };
  }

  const limit = coerceObviousBase10Int(rawLimit, "charLimit");
  if (!limit.ok) return { ok: false, code: "invalid-char-limit", message: limit.message };
  if (limit.value !== undefined && limit.value <= 0) {
    return {
      ok: false,
      code: "invalid-char-limit",
      message: `Invalid charLimit: expected a positive integer, received ${limit.value}.`,
    };
  }

  let charLimit = limit.value;
  if (charLimit !== undefined && charLimit > MAX_CHAR_LIMIT) {
    adjustments.push(`clamped charLimit ${charLimit} to ${MAX_CHAR_LIMIT}`);
    charLimit = MAX_CHAR_LIMIT;
  }

  if (offset.value === undefined && charLimit === undefined) {
    return { ok: true, window: null, adjustments };
  }
  return {
    ok: true,
    window: {
      charOffset: offset.value ?? 0,
      charLimit: charLimit ?? DEFAULT_CHAR_LIMIT,
      charLimitSupplied: charLimit !== undefined,
    },
    adjustments,
  };
}

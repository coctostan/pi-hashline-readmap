import type { PtcWarning } from "./ptc-value.js";
export interface ReadCallTextResult {
  path: string | null;
  suffix: string | undefined;
}

export function formatReadCallText(
  args: Record<string, unknown> | undefined,
): ReadCallTextResult {
  const rawPath = typeof args?.path === "string" ? args.path : null;

  if (typeof args?.symbol === "string" && args.symbol) {
    return { path: rawPath, suffix: `→ symbol ${args.symbol}` };
  }

  if (args?.map === true) {
    return { path: rawPath, suffix: "+ map" };
  }

  if (typeof args?.offset === "number") {
    const offset = args.offset as number;
    const limit = typeof args?.limit === "number" ? (args.limit as number) : undefined;
    if (limit !== undefined) {
      return { path: rawPath, suffix: `lines ${offset}-${offset + limit - 1}` };
    }
    return { path: rawPath, suffix: `from line ${offset}` };
  }

  return { path: rawPath, suffix: undefined };
}


export interface ReadResultTextInput {
  range: { startLine: number; endLine: number; totalLines: number };
  truncation: { outputLines: number; totalLines: number; outputBytes: number; totalBytes: number } | null;
  symbol: { query: string; name: string; kind: string; parentName?: string; startLine: number; endLine: number } | null;
  map: { requested: boolean; appended: boolean };
  warnings: PtcWarning[];
  isError?: boolean;
  errorText?: string;
}

export interface ReadResultTextOutput {
  summary: string;
  symbolBadge: string | undefined;
  badges: string[];
  truncated: boolean;
  errorText: string | undefined;
}

export function formatReadResultText(input: ReadResultTextInput): ReadResultTextOutput {
  const { range, truncation, symbol, map, warnings } = input;

  // Error case
  if (input.isError && input.errorText) {
    return {
      summary: "",
      symbolBadge: undefined,
      badges: [],
      truncated: false,
      errorText: input.errorText,
    };
  }

  // Line count
  const lineCount = range.endLine - range.startLine + 1;
  const isFullFile = range.startLine === 1 && range.endLine === range.totalLines;
  const isTruncated = !!truncation;

  let summary: string;
  if (isTruncated) {
    summary = `\u2713 ${truncation!.outputLines} of ${truncation!.totalLines} lines (truncated)`;
  } else if (isFullFile) {
    summary = `\u2713 ${lineCount} lines`;
  } else {
    summary = `\u2713 ${lineCount} lines (${range.startLine}-${range.endLine} of ${range.totalLines})`;
  }

  // Symbol badge
  const symbolBadge = symbol ? `${symbol.kind} ${symbol.name}` : undefined;

  // Badges
  const badges: string[] = [];
  if (map.appended) badges.push("\ud83d\udcd0 map");
  for (const w of warnings) {
    if (w.code === "binary-content") badges.push("\u26a0 binary");
    if (w.code === "bare-cr") badges.push("\u26a0 bare CR");
  }

  return {
    summary,
    symbolBadge,
    badges,
    truncated: isTruncated,
    errorText: undefined,
  };
}
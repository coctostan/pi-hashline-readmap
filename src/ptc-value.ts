import { computeLineHash, escapeControlCharsForDisplay } from "./hashline.js";
import type { DiffData } from "./diff-data.js";
import { DEFAULT_CHAR_LIMIT, MAX_CHAR_LIMIT, safeCharEnd } from "./read-window.js";

export interface PtcLine {
  line: number;
  hash: string;
  anchor: string;
  raw: string;
  display: string;
}

export interface PtcWarningSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  parentName?: string;
}
export interface PtcWarning {
  code: string;
  message: string;
  tier?: "prefix" | "camelCase" | "substring";
  symbol?: PtcWarningSymbol;
  otherCandidates?: PtcWarningSymbol[];
}

export interface PtcError {
  code: string;
  message: string;
  hint?: string;
  details?: unknown;
}

export interface PtcRange {
  startLine: number;
  endLine: number;
  totalLines?: number;
}

export interface PtcFileGroup {
  path: string;
  ranges: PtcRange[];
  lines: PtcLine[];
}

export interface SemanticSummary {
  classification: "no-op" | "whitespace-only" | "semantic" | "mixed";
  difftasticAvailable: boolean;
  movedBlocks?: number;
}
export interface PtcEditResult {
  tool: "edit";
  ok: boolean;
  path: string;
  summary: string;
  diff: string;
  diffData?: DiffData;
  firstChangedLine: number | undefined;
  warnings: string[];
  noopEdits: unknown[];
  semanticSummary?: SemanticSummary;
}

export function buildPtcLine(line: number, raw: string): PtcLine {
  const hash = computeLineHash(line, raw);
  return {
    line,
    hash,
    anchor: `${line}:${hash}`,
    raw,
    display: escapeControlCharsForDisplay(raw),
  };
}

export function buildPtcLines(startLine: number, rawLines: string[]): PtcLine[] {
  return rawLines.map((raw, index) => buildPtcLine(startLine + index, raw));
}

/**
 * Cap an already-rendered display string at `cap` chars (default 500, grep's per-line threshold),
 * appending a marker that includes the original character count. Display-only:
 * callers must keep the untruncated content for hashing/editing, so anchors and
 * edits still operate on full content. See issue #217. When `lineNumber` is supplied the marker
 * also tells the agent how to fetch the remainder: `read({offset:L, charOffset:K})`, or a range
 * read with a larger `charLimit` while one up to 10,000 would show more.
 */
export function truncateDisplayLine(display: string, lineNumber?: number, cap: number = DEFAULT_CHAR_LIMIT): string {
  if (display.length <= cap) return display;
  const shown = safeCharEnd(display, cap);
  const rangeCap = Math.min(display.length, MAX_CHAR_LIMIT);
  const rangeHint = rangeCap > cap ? ` or a range read with charLimit:${rangeCap}` : "";
  const hint = lineNumber === undefined ? "" : `; read({offset:${lineNumber}, charOffset:${shown}})${rangeHint}`;
  return `${display.slice(0, shown)}... [truncated, ${display.length} chars total${hint}]`;
}

export function renderPtcLine(line: PtcLine, cap?: number): string {
  return `${line.anchor}|${truncateDisplayLine(line.display, line.line, cap)}`;
}

export function renderPtcLines(lines: PtcLine[], cap?: number): string {
  return lines.map((line) => renderPtcLine(line, cap)).join("\n");
}

export function buildPtcWarning(
  code: string,
  message: string,
  metadata: Omit<PtcWarning, "code" | "message"> = {},
): PtcWarning {
  return { code, message, ...metadata };
}

export function buildPtcError(
  code: string,
  message: string,
  hint?: string,
  details?: unknown,
): PtcError {
  return {
    code,
    message,
    ...(hint !== undefined ? { hint } : {}),
    ...(details !== undefined ? { details } : {}),
  };
}

export function buildPtcRange(startLine: number, endLine: number, totalLines?: number): PtcRange {
  return totalLines === undefined ? { startLine, endLine } : { startLine, endLine, totalLines };
}

export function buildPtcFileGroup(path: string, ranges: PtcRange[], lines: PtcLine[]): PtcFileGroup {
  return {
    path,
    ranges: ranges.map((range) => ({ ...range })),
    lines: lines.map((line) => ({ ...line })),
  };
}

export function buildPtcEditResult(input: {
  ok?: boolean;
  path: string;
  summary: string;
  diff: string;
  diffData?: DiffData;
  firstChangedLine: number | undefined;
  warnings: string[];
  noopEdits: unknown[];
  semanticSummary?: SemanticSummary;
}): PtcEditResult {
  return {
    tool: "edit",
    ok: input.ok ?? true,
    path: input.path,
    summary: input.summary,
    diff: input.diff,
    ...(input.diffData ? { diffData: input.diffData } : {}),
    firstChangedLine: input.firstChangedLine,
    warnings: [...input.warnings],
    noopEdits: [...input.noopEdits],
    ...(input.semanticSummary ? { semanticSummary: input.semanticSummary } : {}),
  };
}

import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@earendil-works/pi-coding-agent";
import type { PtcLine, PtcRange } from "./ptc-value.js";
import { truncateDisplayLine } from "./ptc-value.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  buildSymbolResource,
  type ContextHygieneMetadata,
  type ContextHygieneRehydrateDescriptor,
  type ContextHygieneResource,
} from "./context-hygiene.js";

export const AST_SEARCH_OUTPUT_MAX_LINES = DEFAULT_MAX_LINES;
export const AST_SEARCH_OUTPUT_MAX_BYTES = Math.min(DEFAULT_MAX_BYTES, 50 * 1024);

export interface SgOutputBudget { maxLines: number; maxBytes: number }
export interface SgOutputFile {
  displayPath: string;
  path: string;
  ranges: PtcRange[];
  lines: PtcLine[];
  symbols?: Array<{ name: string; kind?: string }>;
}
export interface SgMatchLimitMetadata {
  limit: number;
  totalMatches: number;
  returnedMatches: number;
  omittedMatches: number;
}
export interface SgOutputBudgetMetadata {
  maxLines: number;
  maxBytes: number;
  totalBlocks: number;
  shownBlocks: number;
  omittedBlocks: number;
  totalLines: number;
  shownLines: number;
  totalBytes: number;
  shownBytes: number;
}
export interface SgOutputTruncationMetadata {
  matchLimit?: SgMatchLimitMetadata;
  outputBudget?: SgOutputBudgetMetadata;
}
export interface BuildSgOutputInput {
  pattern: string;
  files: SgOutputFile[];
  matchLimit?: SgMatchLimitMetadata;
  budget?: SgOutputBudget;
  rehydrate?: ContextHygieneRehydrateDescriptor | null;
}
export interface SgOutputResult {
  text: string;
  ptcValue: {
    tool: "ast_search";
    files: Array<{ path: string; ranges: PtcRange[]; lines: PtcLine[] }>;
    truncation?: SgOutputTruncationMetadata;
  };
  contextHygiene: ContextHygieneMetadata;
}

interface RenderedBlock { lines: string[] }

function renderBlocks(files: SgOutputFile[]): RenderedBlock[] {
  const blocks: RenderedBlock[] = [];
  for (const file of files) {
    let headerPending = true;
    const ranges = file.ranges.length > 0
      ? file.ranges
      : file.lines.length > 0
        ? [{ startLine: file.lines[0].line, endLine: file.lines[file.lines.length - 1].line }]
        : [];
    for (const range of ranges) {
      const rendered = file.lines
        .filter((line) => line.line >= range.startLine && line.line <= range.endLine)
        .map((line) => `>>${line.anchor}|${truncateDisplayLine(line.display)}`);
      if (rendered.length === 0) continue;
      if (headerPending) {
        rendered.unshift(`--- ${file.displayPath} ---`);
        headerPending = false;
      }
      blocks.push({ lines: rendered });
    }
  }
  return blocks;
}

function byteLength(lines: string[]): number {
  return Buffer.byteLength(lines.join("\n"), "utf8");
}
function compose(body: string[], notice?: string): string {
  if (body.length === 0) return notice ?? "";
  return notice ? `${body.join("\n")}\n\n${notice}` : body.join("\n");
}
function lineCount(text: string): number {
  return text === "" ? 0 : text.split("\n").length;
}
function fitsBudget(text: string, budget: SgOutputBudget): boolean {
  return (
    lineCount(text) <= Math.max(1, budget.maxLines) &&
    Buffer.byteLength(text, "utf8") <= Math.max(1, budget.maxBytes)
  );
}
function outputMetadata(
  budget: SgOutputBudget,
  allBlocks: RenderedBlock[],
  shownBlocks: RenderedBlock[],
): SgOutputBudgetMetadata {
  const allLines = allBlocks.flatMap((block) => block.lines);
  const shownLines = shownBlocks.flatMap((block) => block.lines);
  return {
    maxLines: budget.maxLines,
    maxBytes: budget.maxBytes,
    totalBlocks: allBlocks.length,
    shownBlocks: shownBlocks.length,
    omittedBlocks: allBlocks.length - shownBlocks.length,
    totalLines: allLines.length,
    shownLines: shownLines.length,
    totalBytes: byteLength(allLines),
    shownBytes: byteLength(shownLines),
  };
}
function guidance(matchLimit?: SgMatchLimitMetadata, output?: SgOutputBudgetMetadata): string | undefined {
  if (matchLimit && output) {
    return `[Results truncated: showing ${matchLimit.returnedMatches} of ${matchLimit.totalMatches} matches (${matchLimit.omittedMatches} omitted); output budget showing ${output.shownBlocks} of ${output.totalBlocks} complete blocks (${output.shownLines} of ${output.totalLines} lines, ${formatSize(output.shownBytes)} of ${formatSize(output.totalBytes)}). Narrow path/pattern or lower/increase limit.]`;
  }
  if (matchLimit) {
    return `[Results truncated: showing ${matchLimit.returnedMatches} of ${matchLimit.totalMatches} matches (${matchLimit.omittedMatches} omitted). Narrow path/pattern or increase limit.]`;
  }
  if (output) {
    return `[Output truncated: showing ${output.shownBlocks} of ${output.totalBlocks} complete blocks (${output.shownLines} of ${output.totalLines} lines, ${formatSize(output.shownBytes)} of ${formatSize(output.totalBytes)}). Narrow path/pattern or lower limit.]`;
  }
  return undefined;
}

export function buildSgOutput(input: BuildSgOutputInput): SgOutputResult {
  if (input.files.length === 0) {
    return {
      text: `No matches found for pattern: ${input.pattern}`,
      ptcValue: { tool: "ast_search", files: [] },
      contextHygiene: buildContextHygieneMetadata({
        tool: "ast_search", classification: "search-context", resources: [],
        rehydrate: input.rehydrate ?? undefined,
      }),
    };
  }

  const budget = input.budget ?? {
    maxLines: AST_SEARCH_OUTPUT_MAX_LINES,
    maxBytes: AST_SEARCH_OUTPUT_MAX_BYTES,
  };
  const allBlocks = renderBlocks(input.files);
  const allBody = allBlocks.flatMap((block) => block.lines);
  let shownBlocks = [...allBlocks];
  let outputBudget: SgOutputBudgetMetadata | undefined;
  let text = compose(allBody, guidance(input.matchLimit));

  if (!fitsBudget(text, budget)) {
    shownBlocks = [];
    for (const block of allBlocks) {
      const candidate = [...shownBlocks, block];
      const candidateMeta = outputMetadata(budget, allBlocks, candidate);
      const candidateText = compose(
        candidate.flatMap((item) => item.lines),
        guidance(input.matchLimit, candidateMeta),
      );
      if (!fitsBudget(candidateText, budget)) break;
      shownBlocks = candidate;
    }
    outputBudget = outputMetadata(budget, allBlocks, shownBlocks);
    text = compose(
      shownBlocks.flatMap((block) => block.lines),
      guidance(input.matchLimit, outputBudget),
    );
  }

  const truncation: SgOutputTruncationMetadata = {
    ...(input.matchLimit && input.matchLimit.omittedMatches > 0 ? { matchLimit: { ...input.matchLimit } } : {}),
    ...(outputBudget ? { outputBudget } : {}),
  };
  const resources: ContextHygieneResource[] = [];
  for (const file of input.files) {
    resources.push(buildFileResource(file.path));
    for (const symbol of file.symbols ?? []) resources.push(buildSymbolResource(file.path, symbol.name, symbol.kind));
  }
  return {
    text,
    ptcValue: {
      tool: "ast_search",
      files: input.files.map((file) => ({
        path: file.path,
        ranges: file.ranges.map((range) => ({ ...range })),
        lines: file.lines.map((line) => ({ ...line })),
      })),
      ...(Object.keys(truncation).length > 0 ? { truncation } : {}),
    },
    contextHygiene: buildContextHygieneMetadata({
      tool: "ast_search", classification: "search-context", resources,
      rehydrate: input.rehydrate ?? undefined,
    }),
  };
}

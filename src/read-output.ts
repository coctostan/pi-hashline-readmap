import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { buildPtcLines, renderPtcLines, type PtcLine, type PtcWarning } from "./ptc-value.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  buildSymbolResource,
  type ContextHygieneMetadata,
  type ContextHygieneRehydrateDescriptor,
  type ContextHygieneResource,
} from "./context-hygiene.js";
import type { SymbolMatchTier } from "./readmap/symbol-lookup.js";

export interface ReadSymbolMetadata {
  query: string;
  name: string;
  kind: string;
  parentName?: string;
  startLine: number;
  endLine: number;
  tier?: SymbolMatchTier;
}

export interface ReadTruncationMetadata {
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
}

export interface ReadMapMetadata {
  requested: boolean;
  appended: boolean;
  text?: string | null;
}

export interface ReadContinuationMetadata {
  nextOffset: number;
  limit?: number;
}

export interface ReadBundleSupportItem {
  symbol: ReadSymbolMetadata;
  lines: string[];
}

export interface ReadBundleMetadata {
  mode: "local";
  applied: boolean;
  localSupport: ReadBundleSupportItem[];
  warnings?: PtcWarning[];
}

export interface ReadOutputInput {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  selectedLines: string[];
  unclipped?: boolean;
  warnings?: PtcWarning[];
  /**
   * @deprecated Compatibility-only. buildReadOutput computes the authoritative
   * displayed-source budget and ignores caller-supplied truncation metadata.
   */
  truncation?: ReadTruncationMetadata | null;
  continuation?: ReadContinuationMetadata | null;
  symbol?: ReadSymbolMetadata | null;
  map?: ReadMapMetadata;
  bundle?: ReadBundleMetadata | null;
  rehydrate?: ContextHygieneRehydrateDescriptor | null;
}

export interface ReadSourceOutput {
  text: string;
  lines: PtcLine[];
  budget: ReturnType<typeof truncateHead>;
  truncation: ReadTruncationMetadata | null;
}

export function buildReadSourceOutput(
  input: Pick<ReadOutputInput, "startLine" | "totalLines" | "selectedLines" | "unclipped">,
): ReadSourceOutput {
  const lines = buildPtcLines(input.startLine, input.selectedLines);
  const renderedLines = renderPtcLines(lines, { unclipped: input.unclipped });
  const budget = truncateHead(renderedLines, {
    maxLines: input.unclipped ? Infinity : DEFAULT_MAX_LINES,
    maxBytes: input.unclipped ? Infinity : DEFAULT_MAX_BYTES,
  });
  const truncation: ReadTruncationMetadata | null = budget.truncated
    ? {
        outputLines: budget.outputLines,
        totalLines: input.totalLines,
        outputBytes: budget.outputBytes,
        totalBytes: budget.totalBytes,
      }
    : null;

  return {
    text: budget.truncated ? budget.content : renderedLines,
    lines,
    budget,
    truncation,
  };
}

export interface ReadOutputResult {
  text: string;
  lines: PtcLine[];
  truncation: ReturnType<typeof truncateHead> | null;
  ptcValue: {
    tool: "read";
    path: string;
    unclipped?: true;
    range: {
      startLine: number;
      endLine: number;
      totalLines: number;
    };
    warnings: PtcWarning[];
    truncation: ReadTruncationMetadata | null;
    continuation: { nextOffset: number } | null;
    symbol: ReadSymbolMetadata | null;
    map: {
      requested: boolean;
      appended: boolean;
    };
    lines: PtcLine[];
    bundle?: {
      mode: "local";
      applied: boolean;
      localSupport: Array<{
        name: string;
        kind: string;
        parentName?: string;
        startLine: number;
        endLine: number;
        lineAnchors: string[];
      }>;
      warnings: PtcWarning[];
    };
  };
  contextHygiene: ContextHygieneMetadata;
}

export function buildReadOutput(
  input: ReadOutputInput,
  sourceOutput: ReadSourceOutput = buildReadSourceOutput(input),
): ReadOutputResult {
  const { lines, truncation } = sourceOutput;
  const warnings = input.warnings ?? [];
  let text = sourceOutput.text;
  const effectiveContinuation = input.continuation
    ? {
        nextOffset: truncation
          ? input.startLine + truncation.outputLines
          : input.continuation.nextOffset,
      }
    : null;

  if (truncation) {
    if (input.symbol && input.continuation && effectiveContinuation) {
      const remainingSelected = input.endLine - effectiveContinuation.nextOffset + 1;
      text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${input.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Continue with read({ path: ${JSON.stringify(input.path)}, offset: ${effectiveContinuation.nextOffset}, limit: ${remainingSelected} }).]`;
    } else {
      text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${input.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${input.startLine + truncation.outputLines} to continue.]`;
    }
  } else if (input.continuation) {
    if (input.symbol && input.continuation.limit !== undefined) {
      text += `\n\n[Showing lines ${input.startLine}-${input.endLine} of symbol '${input.symbol.name}'. Continue with read({ path: ${JSON.stringify(input.path)}, offset: ${input.continuation.nextOffset}, limit: ${input.continuation.limit}${input.unclipped ? ", unclipped: true" : ""} }).]`;
    } else {
      text += `\n\n[Showing lines ${input.startLine}-${input.endLine} of ${input.totalLines}. Use offset=${input.continuation.nextOffset} to continue.]`;
    }
  }

  if (input.bundle?.applied) {
    const supportBlocks = input.bundle.localSupport.map((item) => {
      const supportLines = buildPtcLines(item.symbol.startLine, item.lines);
      return renderPtcLines(supportLines, { unclipped: input.unclipped });
    });
    text = ["## Requested symbol", text, "", "## Local support", ...supportBlocks].join("\n");
  }

  if (input.map?.appended && input.map.text) {
    text += `\n\n${input.map.text}`;
  }

  if (input.symbol) {
    const parentInfo = input.symbol.parentName ? ` in ${input.symbol.parentName}` : "";
    text = `[Symbol: ${input.symbol.name} (${input.symbol.kind})${parentInfo}, lines ${input.symbol.startLine}-${input.symbol.endLine} of ${input.totalLines}]\n\n${text}`;
  }

  if (warnings.length) {
    text = `${warnings.map((warning) => warning.message).join("\n\n")}\n\n${text}`;
  }

  const ptcValue: ReadOutputResult["ptcValue"] = {
    tool: "read",
    path: input.path,
    ...(input.unclipped ? { unclipped: true as const } : {}),
    range: { startLine: input.startLine, endLine: input.endLine, totalLines: input.totalLines },
    warnings,
    truncation,
    continuation: effectiveContinuation,
    symbol: input.symbol ?? null,
    map: {
      requested: input.map?.requested ?? false,
      appended: input.map?.appended ?? false,
    },
    lines,
  };

  if (input.bundle) {
    ptcValue.bundle = {
      mode: input.bundle.mode,
      applied: input.bundle.applied,
      localSupport: input.bundle.localSupport.map((item) => {
        const supportLines = buildPtcLines(item.symbol.startLine, item.lines);
        return {
          name: item.symbol.name,
          kind: item.symbol.kind,
          parentName: item.symbol.parentName,
          startLine: item.symbol.startLine,
          endLine: item.symbol.endLine,
          lineAnchors: supportLines.map((line) => line.anchor),
        };
      }),
      warnings: input.bundle.warnings ?? [],
    };
  }

  const contextHygieneResources: ContextHygieneResource[] = [buildFileResource(input.path)];
  if (input.symbol) {
    contextHygieneResources.push(buildSymbolResource(input.path, input.symbol.name, input.symbol.kind));
  }
  if (input.bundle?.applied) {
    for (const support of input.bundle.localSupport) {
      contextHygieneResources.push(buildSymbolResource(input.path, support.symbol.name, support.symbol.kind));
    }
  }
  const contextHygiene = buildContextHygieneMetadata({
    tool: "read",
    classification: "read-context",
    resources: contextHygieneResources,
    rehydrate: input.rehydrate ?? undefined,
  });

  return {
    text,
    lines,
    truncation: sourceOutput.budget.truncated ? sourceOutput.budget : null,
    ptcValue,
    contextHygiene,
  };
}

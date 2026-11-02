import type { CompressionInfo } from "./bash-filter.ts";
import { stripAnsi } from "./ansi.ts";

/**
 * Public, stable bash output contract for RTK compaction metadata.
 *
 * Emitted on every bash tool result where the RTK pipeline had the opportunity
 * to inspect output. Consumers (display extensions, downstream tools) may rely
 * on this shape. See prompts/bash.md for the full contract.
 */
export type RtkCompaction = {
  applied: boolean;
  techniques: string[];
  truncated: boolean;
  originalLineCount?: number;
  compactedLineCount?: number;
};

export interface BuildRtkCompactionInput {
  rawInput: string;
  output: string;
  /** `filterBashOutput`'s `compacted`: a compactor changed the output, beyond ANSI and the anti-pattern hint. */
  compacted: boolean;
  info: CompressionInfo;
}

// Matches deterministic truncation markers emitted by RTK routes when they drop output beyond a route budget.
const ROUTE_TRUNCATION_MARKERS = [
  /^\.\.\. \d+ lines omitted \.\.\.$/gm,
  /^(?: {2})?\.\.\. and \d+ more (?:commits|lines|errors|files|rules)$/gm,
  /^ {2}\.\.\. \(\d+ context lines\)$/gm,
  /^\[\.\.\. \d+ more lines\]$/gm,
  /^Total: \d+ entries in \d+ directories$/gm,
];
const ROUTE_TRUNCATION_TECHNIQUES = new Set<CompressionInfo["technique"]>([
  "git",
  "linter",
  "build-tools",
  "build",
  "package-manager",
  "docker",
  "file-listing",
  "http-client",
  "transfer",
]);

function extractRouteTruncationMarkers(text: string): string[] {
  return ROUTE_TRUNCATION_MARKERS.flatMap((marker) => Array.from(text.matchAll(marker), ([match]) => match.trim()));
}

function markerCounts(markers: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const marker of markers) counts.set(marker, (counts.get(marker) ?? 0) + 1);
  return counts;
}

function introducedRouteTruncationMarker(rawInput: string, output: string): boolean {
  const rawCounts = markerCounts(extractRouteTruncationMarkers(stripAnsi(rawInput)));
  const outputCounts = markerCounts(extractRouteTruncationMarkers(output));
  return Array.from(outputCounts).some(([marker, count]) => count > (rawCounts.get(marker) ?? 0));
}

export function buildRtkCompaction(input: BuildRtkCompactionInput): RtkCompaction {
  const { rawInput, output, compacted, info } = input;
  // The test-output short-circuit only strips ANSI, which this contract counts as its technique applying.
  const applied = info.technique === "test-output" ? rawInput !== output : compacted;
  const truncated =
    ROUTE_TRUNCATION_TECHNIQUES.has(info.technique) && compacted && introducedRouteTruncationMarker(rawInput, output);
  const compaction: RtkCompaction = {
    applied,
    techniques: applied ? [info.technique] : [],
    truncated,
  };
  if (rawInput !== "") {
    compaction.originalLineCount = rawInput.split("\n").length;
    compaction.compactedLineCount = output.split("\n").length;
  }
  return compaction;
}

import type { CompressionInfo } from "./bash-filter.ts";
import type { Drop } from "./drops.ts";

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
  dropped: Drop[];
  originalLineCount?: number;
  compactedLineCount?: number;
};

export interface BuildRtkCompactionInput {
  rawInput: string;
  output: string;
  /** `filterBashOutput`'s `compacted`: a compactor changed the output, beyond ANSI and the anti-pattern hint. */
  compacted: boolean;
  /** `filterBashOutput`'s `dropped`: what the compactor reported leaving out, one entry per marker. */
  dropped: Drop[];
  info: CompressionInfo;
}

export function buildRtkCompaction(input: BuildRtkCompactionInput): RtkCompaction {
  const { rawInput, output, compacted, dropped, info } = input;
  // The test-output short-circuit only strips ANSI, which this contract counts as its technique applying.
  const applied = info.technique === "test-output" ? rawInput !== output : compacted;
  const compaction: RtkCompaction = {
    applied,
    techniques: applied ? [info.technique] : [],
    truncated: dropped.length > 0,
    dropped,
  };
  if (rawInput !== "") {
    compaction.originalLineCount = rawInput.split("\n").length;
    compaction.compactedLineCount = output.split("\n").length;
  }
  return compaction;
}

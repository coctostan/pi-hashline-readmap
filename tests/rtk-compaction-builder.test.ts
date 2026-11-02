import { describe, it, expect } from "vitest";
import { buildRtkCompaction, type RtkCompaction } from "../src/rtk/rtk-compaction.js";
import { filterBashOutput, type CompressionInfo } from "../src/rtk/bash-filter.js";
import { gitLog, gitLogGraph, gitLogOneline } from "./helpers/git-log-fixture.js";

const noneInfo = (originalBytes = 10, outputBytes = 10): CompressionInfo => ({
  originalBytes,
  outputBytes,
  compressionRatio: originalBytes === 0 ? 1 : outputBytes / originalBytes,
  technique: "none",
});

const info = (rawInput: string, output: string, technique: CompressionInfo["technique"]): CompressionInfo => ({
  originalBytes: Buffer.byteLength(rawInput, "utf8"),
  outputBytes: Buffer.byteLength(output, "utf8"),
  compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
  technique,
});

describe("buildRtkCompaction — no-op case", () => {
  it("returns applied=false, techniques=[], truncated=false, dropped=[] when technique is 'none' and output equals input", () => {
    const rawInput = "hello\nworld\n";
    const output = "hello\nworld\n";
    const result: RtkCompaction = buildRtkCompaction({ rawInput, output, compacted: false, dropped: [], info: noneInfo(12, 12) });
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.dropped).toEqual([]);
  });
});

describe("buildRtkCompaction — single technique applied", () => {
  it("returns applied=true and techniques=['git'] when technique is 'git' and output differs from input", () => {
    const rawInput = "M  file.ts\n?? other.ts\n";
    const output = "M  file.ts (and 1 untracked)\n";
    const result = buildRtkCompaction({ rawInput, output, compacted: true, dropped: [], info: info(rawInput, output, "git") });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["git"]);
    expect(result.truncated).toBe(false);
  });

  it("returns applied=true when a technique rewrites output to different content with the same byte length", () => {
    const rawInput = "abcd\n";
    const output = "wxyz\n";
    const result = buildRtkCompaction({ rawInput, output, compacted: true, dropped: [], info: info(rawInput, output, "git") });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["git"]);
  });

  it("does not count ANSI-only normalization as a routed technique applying", () => {
    const rawInput = "\u001b[32mok\u001b[0m\n";
    const output = "ok\n";
    const result = buildRtkCompaction({ rawInput, output, compacted: false, dropped: [], info: info(rawInput, output, "http-client") });
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
  });

  it("does not count an appended anti-pattern hint as a technique applying", () => {
    const rawInput = "src/a.ts\n";
    const output = "src/a.ts\n\n\n[Hint: Prefer the dedicated file-search tools for repository discovery.]";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: false,
      dropped: [],
      info: { originalBytes: 9, outputBytes: output.length, compressionRatio: output.length / 9, technique: "file-listing" },
    });
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.compactedLineCount).toBe(4);
  });

  it("counts test-output as applied only when its ANSI stripping changed the output", () => {
    const info: CompressionInfo = { originalBytes: 5, outputBytes: 5, compressionRatio: 1, technique: "test-output" };
    expect(buildRtkCompaction({ rawInput: "PASS\n", output: "PASS\n", compacted: false, dropped: [], info }).applied).toBe(false);
  });

  it("preserves array shape (techniques is always an array)", () => {
    const result = buildRtkCompaction({
      rawInput: "x\n",
      output: "yy\n",
      compacted: true,
      dropped: [],
      info: { originalBytes: 2, outputBytes: 3, compressionRatio: 1.5, technique: "linter" },
    });
    expect(Array.isArray(result.techniques)).toBe(true);
    expect(result.techniques).toEqual(["linter"]);
  });
});

describe("buildRtkCompaction — line counts", () => {
  it("populates originalLineCount and compactedLineCount from newline-split lengths", () => {
    const rawInput = "a\nb\nc\nd\n"; // split → ["a","b","c","d",""] → 5
    const output = "a\nb\n"; // split → ["a","b",""] → 3
    const result = buildRtkCompaction({ rawInput, output, compacted: true, dropped: [], info: info(rawInput, output, "git") });
    expect(result.originalLineCount).toBe(5);
    expect(result.compactedLineCount).toBe(3);
  });

  it("omits line counts when rawInput is empty (empty-input fast path)", () => {
    const result = buildRtkCompaction({
      rawInput: "",
      output: "",
      compacted: false,
      dropped: [],
      info: { originalBytes: 0, outputBytes: 0, compressionRatio: 1, technique: "none" },
    });
    expect(result.originalLineCount).toBeUndefined();
    expect(result.compactedLineCount).toBeUndefined();
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe("buildRtkCompaction — dropped and truncated", () => {
  it("reports the compactor's drops and sets truncated when there are any", () => {
    const rawInput = "diff --git a/a b/a\n";
    const output = "diff --git a/a b/a\n... and 12 more lines\n";
    const dropped = [{ count: 12, unit: "lines" }];
    const result = buildRtkCompaction({ rawInput, output, compacted: true, dropped, info: info(rawInput, output, "git") });
    expect(result).toMatchObject({ applied: true, techniques: ["git"], truncated: true, dropped });
  });

  it("leaves truncated=false for a literal marker the compactor kept but reported no drop for", () => {
    const rawInput = "warning\n... 16 lines omitted ...\nextra\n";
    const output = "warning\n... 16 lines omitted ...\n";
    const result = buildRtkCompaction({ rawInput, output, compacted: true, dropped: [], info: info(rawInput, output, "package-manager") });
    expect(result).toMatchObject({ applied: true, techniques: ["package-manager"], truncated: false, dropped: [] });
  });
});

describe("buildRtkCompaction — git log reports exactly what it dropped", () => {
  const markerIdentical = gitLogOneline(20) + "... and 1 more lines\n";
  it.each([
    ["git log -3", gitLog(3), { applied: false, techniques: [], truncated: false, dropped: [] }],
    ["git log -30", gitLog(30), { applied: true, techniques: ["git"], truncated: true, dropped: [{ count: 10, unit: "commits" }] }],
    ["git log --graph -30", gitLogGraph(30), { applied: true, techniques: ["git"], truncated: true, dropped: [{ count: 10, unit: "commits" }] }],
    ["git log --oneline -30", gitLogOneline(30), { applied: true, techniques: ["git"], truncated: true, dropped: [{ count: 10, unit: "lines" }] }],
    // Its dropped 21st line reads like the marker that replaces it, which marker re-detection counted as no drop.
    ["git log --oneline", markerIdentical, { applied: true, techniques: ["git"], truncated: true, dropped: [{ count: 1, unit: "lines" }] }],
  ])("%s", (command, rawInput, expected) => {
    const { output, compacted, info, dropped } = filterBashOutput(command, rawInput);
    expect(buildRtkCompaction({ rawInput, output, compacted, info, dropped })).toMatchObject(expected);
  });
});

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

describe("buildRtkCompaction — no-op case", () => {
  it("returns applied=false, techniques=[], truncated=false when technique is 'none' and output equals input", () => {
    const rawInput = "hello\nworld\n";
    const output = "hello\nworld\n";
    const result: RtkCompaction = buildRtkCompaction({ rawInput, output, compacted: false, info: noneInfo(12, 12) });
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe("buildRtkCompaction — single technique applied", () => {
  it("returns applied=true and techniques=['git'] when technique is 'git' and output differs from input", () => {
    const rawInput = "M  file.ts\n?? other.ts\n";
    const output = "M  file.ts (and 1 untracked)\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "git",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["git"]);
    expect(result.truncated).toBe(false);
  });

  it("returns applied=true when a technique rewrites output to different content with the same byte length", () => {
    const rawInput = "abcd\n";
    const output = "wxyz\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: 1,
        technique: "git",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["git"]);
  });

  it("does not count ANSI-only normalization as a routed technique applying", () => {
    const rawInput = "\u001b[32mok\u001b[0m\n";
    const output = "ok\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: false,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "http-client",
      },
    });
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
      info: { originalBytes: 9, outputBytes: output.length, compressionRatio: output.length / 9, technique: "file-listing" },
    });
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.compactedLineCount).toBe(4);
  });

  it("counts test-output as applied only when its ANSI stripping changed the output", () => {
    const info: CompressionInfo = { originalBytes: 5, outputBytes: 5, compressionRatio: 1, technique: "test-output" };
    expect(buildRtkCompaction({ rawInput: "PASS\n", output: "PASS\n", compacted: false, info }).applied).toBe(false);
  });
  it("preserves array shape (techniques is always an array)", () => {
    const rawInput = "x\n";
    const output = "yy\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: { originalBytes: 2, outputBytes: 3, compressionRatio: 1.5, technique: "linter" },
    });
    expect(Array.isArray(result.techniques)).toBe(true);
    expect(result.techniques).toEqual(["linter"]);
  });
});

describe("buildRtkCompaction — line counts", () => {
  it("populates originalLineCount and compactedLineCount from newline-split lengths", () => {
    const rawInput = "a\nb\nc\nd\n";   // split → ["a","b","c","d",""] → 5
    const output = "a\nb\n";            // split → ["a","b",""] → 3
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: output.length / rawInput.length,
        technique: "git",
      },
    });
    expect(result.originalLineCount).toBe(5);
    expect(result.compactedLineCount).toBe(3);
  });

  it("omits line counts when rawInput is empty (empty-input fast path)", () => {
    const result = buildRtkCompaction({
      rawInput: "",
      output: "",
      compacted: false,
      info: { originalBytes: 0, outputBytes: 0, compressionRatio: 1, technique: "none" },
    });
    expect(result.originalLineCount).toBeUndefined();
    expect(result.compactedLineCount).toBeUndefined();
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe("buildRtkCompaction — truncated", () => {
  it("sets truncated=true when output contains the truncateLines marker", () => {
    const rawInput = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const output = ["line 1", "line 2", "", "... 16 lines omitted ...", "", "line 19", "line 20"].join("\n") + "\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: output.length / rawInput.length,
        technique: "git",
      },
    });
    expect(result.truncated).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["git"]);
  });

  it("sets truncated=true when a route introduces a git diff budget marker", () => {
    const rawInput = "diff --git a/a b/a\n";
    const output = "diff --git a/a b/a\n... and 12 more lines\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "git",
      },
    });
    expect(result.truncated).toBe(true);
  });

  it("sets truncated=true when a route introduces an HTTP body budget marker", () => {
    const rawInput = "line 1\nline 2\n";
    const output = "line 1\n[... 42 more lines]\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "http-client",
      },
    });
    expect(result.truncated).toBe(true);
  });

  it("leaves truncated=false when no compactor changed the output, so truncated implies applied", () => {
    const rawInput = "a\n";
    const output = "a\n... and 3 more commits\n";
    const info: CompressionInfo = { originalBytes: 2, outputBytes: output.length, compressionRatio: 1, technique: "git" };
    const result = buildRtkCompaction({ rawInput, output, compacted: false, info });
    expect(result).toMatchObject({ applied: false, truncated: false });
  });
  it("leaves truncated=false when output has no truncation marker", () => {
    const rawInput = "a\nb\n";
    const output = "a-compressed\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: output.length / rawInput.length,
        technique: "git",
      },
    });
    expect(result.truncated).toBe(false);
  });

  it("does not treat a no-route command's literal marker text as RTK truncation", () => {
    const rawInput = "... 16 lines omitted ...\n";
    const result = buildRtkCompaction({
      rawInput,
      output: rawInput,
      compacted: false,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(rawInput, "utf8"),
        compressionRatio: 1,
        technique: "none",
      },
    });
    expect(result.truncated).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.techniques).toEqual([]);
  });

  it("does not treat a route-preserved literal marker from raw input as RTK truncation", () => {
    const rawInput = "warning\n... 16 lines omitted ...\nextra\n";
    const output = "warning\n... 16 lines omitted ...\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "package-manager",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["package-manager"]);
    expect(result.truncated).toBe(false);
  });

  it("detects an introduced marker even when another marker from raw input was removed", () => {
    const rawInput = "... 16 lines omitted ...\n";
    const output = "... and 12 more lines\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "git",
      },
    });
    expect(result.truncated).toBe(true);
  });

  it("detects an introduced marker when raw input had a different marker of the same pattern", () => {
    const rawInput = "  ... and 1 more files\n";
    const output = "  ... and 50 more files\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "git",
      },
    });
    expect(result.truncated).toBe(true);
  });

  it("normalizes ANSI before comparing raw marker text with routed output", () => {
    const rawInput = "\u001b[33m... and 3 more commits\u001b[0m\nextra\n";
    const output = "... and 3 more commits\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: true,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "git",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["git"]);
    expect(result.truncated).toBe(false);
  });

  it("does not treat test-output marker text as route-internal RTK truncation", () => {
    const rawInput = "\u001b[32mPASS\u001b[0m\n... 16 lines omitted ...\n";
    const output = "PASS\n... 16 lines omitted ...\n";
    const result = buildRtkCompaction({
      rawInput,
      output,
      compacted: false,
      info: {
        originalBytes: Buffer.byteLength(rawInput, "utf8"),
        outputBytes: Buffer.byteLength(output, "utf8"),
        compressionRatio: Buffer.byteLength(output, "utf8") / Buffer.byteLength(rawInput, "utf8"),
        technique: "test-output",
      },
    });
    expect(result.applied).toBe(true);
    expect(result.techniques).toEqual(["test-output"]);
    expect(result.truncated).toBe(false);
  });
});

describe("buildRtkCompaction — git log sets truncated exactly when it dropped something", () => {
  it.each([
    ["git log -3", gitLog(3), { applied: false, techniques: [], truncated: false }],
    ["git log -30", gitLog(30), { applied: true, techniques: ["git"], truncated: true }],
    ["git log --graph -30", gitLogGraph(30), { applied: true, techniques: ["git"], truncated: true }],
    ["git log --oneline -30", gitLogOneline(30), { applied: true, techniques: ["git"], truncated: true }],
  ])("%s", (command, rawInput, expected) => {
    const { output, compacted, info } = filterBashOutput(command, rawInput);
    expect(buildRtkCompaction({ rawInput, output, compacted, info })).toMatchObject(expected);
  });
});

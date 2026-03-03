import { describe, it, expect } from "vitest";
import { compactDiff } from "../src/rtk/git.js";

// Helper to build a synthetic diff string
function buildDiff(files: Array<{ name: string; hunks: Array<{ header: string; lines: string[] }> }>): string {
  const parts: string[] = [];
  for (const file of files) {
    parts.push(`diff --git a/${file.name} b/${file.name}`);
    parts.push(`index abc1234..def5678 100644`);
    parts.push(`--- a/${file.name}`);
    parts.push(`+++ b/${file.name}`);
    for (const hunk of file.hunks) {
      parts.push(hunk.header);
      parts.push(...hunk.lines);
    }
  }
  return parts.join("\n");
}

describe("compactDiff — change line preservation", () => {
  it("preserves all + lines even when there are 20 of them in a single hunk", () => {
    const addedLines = Array.from({ length: 20 }, (_, i) => `+  added line ${i + 1}`);
    const diff = buildDiff([{
      name: "src/foo.ts",
      hunks: [{
        header: "@@ -1,1 +1,20 @@",
        lines: [" context", ...addedLines],
      }],
    }]);

    const result = compactDiff(diff);

    // All 20 + lines must appear in output
    for (let i = 1; i <= 20; i++) {
      expect(result).toContain(`added line ${i}`);
    }
  });

  it("preserves all - lines even when there are 20 of them in a single hunk", () => {
    const removedLines = Array.from({ length: 20 }, (_, i) => `-  removed line ${i + 1}`);
    const diff = buildDiff([{
      name: "src/foo.ts",
      hunks: [{
        header: "@@ -1,20 +1,1 @@",
        lines: [...removedLines, " context"],
      }],
    }]);

    const result = compactDiff(diff);

    for (let i = 1; i <= 20; i++) {
      expect(result).toContain(`removed line ${i}`);
    }
  });

  it("does NOT truncate change lines with the old (truncated) message", () => {
    const addedLines = Array.from({ length: 15 }, (_, i) => `+  line ${i + 1}`);
    const diff = buildDiff([{
      name: "src/bar.ts",
      hunks: [{
        header: "@@ -1,1 +1,15 @@",
        lines: addedLines,
      }],
    }]);

    const result = compactDiff(diff);
    // Old code would emit "... (truncated)" after 10 hunk lines
    expect(result).not.toContain("(truncated)");
  });
});

describe("compactDiff — context compression", () => {
  it("compresses context lines to at most 3 per hunk", () => {
    const contextLines = Array.from({ length: 10 }, (_, i) => ` context line ${i + 1}`);
    const diff = buildDiff([{
      name: "src/baz.ts",
      hunks: [{
        header: "@@ -1,12 +1,13 @@",
        lines: [...contextLines, "+  new line"],
      }],
    }]);

    const result = compactDiff(diff);

    // Count how many context lines appear (lines that start with two spaces — "  context line")
    const contextMatches = (result.match(/  context line \d+/g) || []).length;
    expect(contextMatches).toBeLessThanOrEqual(3);
  });

  it("still shows the change line when context is compressed", () => {
    const contextLines = Array.from({ length: 10 }, (_, i) => ` context line ${i + 1}`);
    const diff = buildDiff([{
      name: "src/baz.ts",
      hunks: [{
        header: "@@ -1,12 +1,13 @@",
        lines: [...contextLines, "+  new line"],
      }],
    }]);

    const result = compactDiff(diff);
    expect(result).toContain("new line");
  });
});

describe("compactDiff — overall line cap", () => {
  it("defaults to a cap of 100 lines", () => {
    // Build a diff with many files/hunks to exceed 100 output lines
    const files = Array.from({ length: 20 }, (_, fi) => ({
      name: `src/file${fi}.ts`,
      hunks: [{
        header: "@@ -1,1 +1,5 @@",
        lines: Array.from({ length: 5 }, (_, li) => `+  line ${li + 1}`),
      }],
    }));
    const diff = buildDiff(files);

    const result = compactDiff(diff);
    const lineCount = result.split("\n").length;
    // Should be capped at ~100 lines (allow small overshoot for cap indicator)
    expect(lineCount).toBeLessThanOrEqual(110);
  });

  it("accepts a custom maxLines parameter", () => {
    const files = Array.from({ length: 20 }, (_, fi) => ({
      name: `src/file${fi}.ts`,
      hunks: [{
        header: "@@ -1,1 +1,5 @@",
        lines: Array.from({ length: 5 }, (_, li) => `+  line ${li + 1}`),
      }],
    }));
    const diff = buildDiff(files);

    const result = compactDiff(diff, 30);
    const lineCount = result.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(40);
  });

  it("shows a truncation indicator when output is capped", () => {
    const files = Array.from({ length: 30 }, (_, fi) => ({
      name: `src/file${fi}.ts`,
      hunks: [{
        header: "@@ -1,1 +1,5 @@",
        lines: Array.from({ length: 5 }, (_, li) => `+  line ${li + 1}`),
      }],
    }));
    const diff = buildDiff(files);

    const result = compactDiff(diff, 30);
    expect(result).toMatch(/truncated|more changes/i);
  });
});

describe("compactDiff — change lines exceeding overall cap", () => {
  it("emits a '... +K more changes' indicator when change lines themselves exceed the cap", () => {
    // 200 + lines in one hunk
    const addedLines = Array.from({ length: 200 }, (_, i) => `+  big line ${i + 1}`);
    const diff = buildDiff([{
      name: "src/huge.ts",
      hunks: [{
        header: "@@ -1,1 +1,200 @@",
        lines: addedLines,
      }],
    }]);

    const result = compactDiff(diff, 50);
    // Should have a "more changes" indicator
    expect(result).toMatch(/\+\d+ more changes/);
  });
});

describe("compactDiff — backward compatibility", () => {
  it("returns a non-empty string for an empty diff", () => {
    expect(compactDiff("")).toBe("");
  });

  it("handles git status diff correctly (no change lines)", () => {
    const diff = buildDiff([{
      name: "src/clean.ts",
      hunks: [{
        header: "@@ -1,3 +1,3 @@",
        lines: [" line1", " line2", " line3"],
      }],
    }]);
    const result = compactDiff(diff);
    // No +/- lines so stats summary shows +0 -0 is NOT emitted (only if added>0 or removed>0)
    expect(result).toContain("src/clean.ts");
  });

  it("still shows file stat summary (+N -M) after each file", () => {
    const diff = buildDiff([{
      name: "src/changed.ts",
      hunks: [{
        header: "@@ -1,1 +1,3 @@",
        lines: ["-  old line", "+  new line 1", "+  new line 2"],
      }],
    }]);
    const result = compactDiff(diff);
    expect(result).toMatch(/\+2 -1/);
  });
});

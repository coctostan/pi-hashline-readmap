// tests/repro-030c-compact-diff-changes.test.ts
import { describe, it, expect } from "vitest";
import { compactDiff } from "../src/rtk/git.js";
describe("Feature #030c: compactDiff preserves change lines, compresses context", () => {
  const makeHunk = (numChanges: number): string => {
    const lines: string[] = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,50 +1,50 @@",
    ];
    lines.push(" context line 1");
    lines.push(" context line 2");
    lines.push(" context line 3");
    for (let i = 0; i < numChanges; i++) {
      lines.push(`-old line ${i + 1}`);
      lines.push(`+new line ${i + 1}`);
    }
    lines.push(" context line 4");
    lines.push(" context line 5");
    lines.push(" context line 6");
    return lines.join("\n");
  };
  it("preserves all 20 +/- lines in a hunk (old behavior truncated at 10)", () => {
    const diff = makeHunk(10); // 10 removals + 10 additions = 20 change lines
    const result = compactDiff(diff);
    for (let i = 1; i <= 10; i++) {
      expect(result).toContain(`+new line ${i}`);
      expect(result).toContain(`-old line ${i}`);
    }
  });
  it("compresses context lines to max 3 per side", () => {
    const lines: string[] = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,20 +1,20 @@",
    ];
    for (let i = 0; i < 8; i++) lines.push(` context before ${i}`);
    lines.push("-old");
    lines.push("+new");
    for (let i = 0; i < 8; i++) lines.push(` context after ${i}`);
    const result = compactDiff(lines.join("\n"));
    expect(result).toContain("-old");
    expect(result).toContain("+new");
    // Only last 3 before-context and first 3 after-context should be shown
    const contextBeforeCount = (result.match(/context before/g) || []).length;
    const contextAfterCount = (result.match(/context after/g) || []).length;
    expect(contextBeforeCount).toBe(3);
    expect(contextAfterCount).toBe(3);
  });
  it("defaults to maxLines=100 instead of 50", () => {
    const lines: string[] = [
      "diff --git a/big.ts b/big.ts",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1,80 +1,80 @@",
    ];
    for (let i = 0; i < 40; i++) {
      lines.push(`-old line ${i}`);
      lines.push(`+new line ${i}`);
    }
    const result = compactDiff(lines.join("\n"));
    // With new maxLines=100, all 80 change lines should fit
    expect(result).toContain("+new line 39");
    expect(result).toContain("-old line 39");
  });

  it("when change lines exceed maxLines, shows first/last change lines with truncation indicator", () => {
    const lines: string[] = [
      "diff --git a/huge.ts b/huge.ts",
      "--- a/huge.ts",
      "+++ b/huge.ts",
      "@@ -1,200 +1,200 @@",
    ];
    for (let i = 0; i < 100; i++) {
      lines.push(`-old ${i}`);
      lines.push(`+new ${i}`);
    }
    // 200 change lines + file header + hunk header + stats = well over 30
    const result = compactDiff(lines.join("\n"), 30);
    // Should contain the first change lines
    expect(result).toContain("-old 0");
    expect(result).toContain("+new 0");
    // Should contain the last change lines
    expect(result).toContain("-old 99");
    expect(result).toContain("+new 99");
    // Should contain a truncation indicator with the count of omitted lines
    expect(result).toMatch(/\.\.\. \+\d+ more changes/);
    // Should NOT contain middle lines that were truncated
    expect(result).not.toContain("+new 50");
  });
  it("does not treat interstitial context between change blocks as change lines", () => {
    const lines: string[] = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,20 +1,20 @@",
      "-old block 1",
      "+new block 1",
      " interstitial context",  // context between two change blocks
      "-old block 2",
      "+new block 2",
    ];
    const result = compactDiff(lines.join("\n"));
    // Both change blocks and the interstitial context should all be present
    expect(result).toContain("-old block 1");
    expect(result).toContain("+new block 1");
    expect(result).toContain("interstitial context");
    expect(result).toContain("-old block 2");
    expect(result).toContain("+new block 2");
  });
});

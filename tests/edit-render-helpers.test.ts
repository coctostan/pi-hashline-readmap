import { describe, it, expect } from "vitest";
import { countEditTypes, parseDiffStats, formatEditCallText, formatEditResultText } from "../src/edit-render-helpers.js";

describe("countEditTypes", () => {
  it("counts each edit variant type in an edits array", () => {
    const edits = [
      { set_line: { anchor: "1:ab", new_text: "x" } },
      { set_line: { anchor: "2:cd", new_text: "y" } },
      { replace: { old_text: "a", new_text: "b" } },
      { replace_lines: { start_anchor: "3:ef", end_anchor: "5:gh", new_text: "z" } },
      { insert_after: { anchor: "6:ij", new_text: "w" } },
    ];
    const result = countEditTypes(edits);
    expect(result).toEqual({
      set_line: 2,
      replace_lines: 1,
      insert_after: 1,
      replace: 1,
      total: 5,
    });
  });

  it("returns all zeros for empty array", () => {
    const result = countEditTypes([]);
    expect(result).toEqual({
      set_line: 0,
      replace_lines: 0,
      insert_after: 0,
      replace: 0,
      total: 0,
    });
  });

  it("returns all zeros for undefined input", () => {
    const result = countEditTypes(undefined);
    expect(result).toEqual({
      set_line: 0,
      replace_lines: 0,
      insert_after: 0,
      replace: 0,
      total: 0,
    });
  });

  it("handles edits with unrecognized keys gracefully", () => {
    const edits = [
      { set_line: { anchor: "1:ab", new_text: "x" } },
      { unknown_op: { foo: "bar" } } as any,
    ];
    const result = countEditTypes(edits);
    expect(result).toEqual({
      set_line: 1,
      replace_lines: 0,
      insert_after: 0,
      replace: 0,
      total: 2,
    });
  });
});

describe("parseDiffStats", () => {
  it("counts added and removed lines from a unified diff string", () => {
    const diff = [
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,4 @@",
      " const one = 1;",
      "-const two = 2;",
      "+const two = 22;",
      "+const twoB = 2.5;",
      " const three = 3;",
    ].join("\n");
    const result = parseDiffStats(diff);
    expect(result).toEqual({ added: 2, removed: 1 });
  });

  it("returns zeros for empty string", () => {
    expect(parseDiffStats("")).toEqual({ added: 0, removed: 0 });
  });

  it("returns zeros for undefined input", () => {
    expect(parseDiffStats(undefined)).toEqual({ added: 0, removed: 0 });
  });

  it("ignores --- and +++ header lines", () => {
    const diff = [
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,2 +1,2 @@",
      "-old line",
      "+new line",
    ].join("\n");
    const result = parseDiffStats(diff);
    expect(result).toEqual({ added: 1, removed: 1 });
  });

  it("handles multi-hunk diffs", () => {
    const diff = [
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,3 @@",
      "-line1",
      "+LINE1",
      " line2",
      " line3",
      "@@ -10,3 +10,4 @@",
      " line10",
      "-line11",
      "+LINE11",
      "+LINE11B",
      " line12",
    ].join("\n");
    const result = parseDiffStats(diff);
    expect(result).toEqual({ added: 3, removed: 2 });
  });
});

describe("formatEditCallText", () => {
  it("returns path-only when argsComplete is false", () => {
    const result = formatEditCallText({ path: "src/foo.ts" }, false);
    expect(result).toEqual({ path: "src/foo.ts", suffix: undefined });
  });

  it("returns placeholder when path is missing", () => {
    const result = formatEditCallText({}, false);
    expect(result).toEqual({ path: null, suffix: undefined });
  });

  it("returns edit breakdown when edits[] is present and args complete", () => {
    const args = {
      path: "src/foo.ts",
      edits: [
        { set_line: { anchor: "1:ab", new_text: "x" } },
        { set_line: { anchor: "2:cd", new_text: "y" } },
        { replace: { old_text: "a", new_text: "b" } },
      ],
    };
    const result = formatEditCallText(args, true);
    expect(result.path).toBe("src/foo.ts");
    expect(result.suffix).toBe("3 edits (2 set_line, 1 replace)");
  });

  it("returns 'replace' for legacy oldText/newText mode", () => {
    const args = { path: "src/foo.ts", oldText: "a", newText: "b" };
    const result = formatEditCallText(args, true);
    expect(result.path).toBe("src/foo.ts");
    expect(result.suffix).toBe("replace");
  });

  it("returns 'replace' for legacy old_text/new_text mode", () => {
    const args = { path: "src/foo.ts", old_text: "a", new_text: "b" };
    const result = formatEditCallText(args, true);
    expect(result.path).toBe("src/foo.ts");
    expect(result.suffix).toBe("replace");
  });

  it("returns no suffix when args complete but no edits or legacy fields", () => {
    const result = formatEditCallText({ path: "src/foo.ts" }, true);
    expect(result).toEqual({ path: "src/foo.ts", suffix: undefined });
  });

  it("formats single edit without breakdown parenthetical", () => {
    const args = {
      path: "src/foo.ts",
      edits: [{ set_line: { anchor: "1:ab", new_text: "x" } }],
    };
    const result = formatEditCallText(args, true);
    expect(result.suffix).toBe("1 edit (1 set_line)");
  });

  it("only includes non-zero type counts in breakdown", () => {
    const args = {
      path: "src/foo.ts",
      edits: [
        { insert_after: { anchor: "1:ab", new_text: "x" } },
        { insert_after: { anchor: "2:cd", new_text: "y" } },
      ],
    };
    const result = formatEditCallText(args, true);
    expect(result.suffix).toBe("2 edits (2 insert_after)");
  });
});

describe("formatEditResultText", () => {
  it("returns diff stats for a successful result", () => {
    const diff = "@@ -1,2 +1,3 @@\n-old\n+new1\n+new2\n ctx";
    const result = formatEditResultText({
      isError: false,
      diff,
      warnings: [],
      noopEdits: [],
      errorText: "",
    });
    expect(result.diffStats).toBe("+2 / -1");
    expect(result.noOp).toBe(false);
    expect(result.warningsBadge).toBeUndefined();
    expect(result.errorText).toBeUndefined();
  });

  it("returns no-op indicator for noop error", () => {
    const result = formatEditResultText({
      isError: true,
      diff: "",
      warnings: [],
      noopEdits: [{ editIndex: 0, loc: "1:ab" }],
      errorText: "No changes made to src/foo.ts. The edits produced identical content.",
    });
    expect(result.noOp).toBe(true);
    expect(result.errorText).toContain("No changes made");
  });

  it("returns warnings badge singular", () => {
    const result = formatEditResultText({
      isError: false,
      diff: "@@ -1,1 +1,1 @@\n-a\n+b",
      warnings: ["anchor mismatch on line 5"],
      noopEdits: [],
      errorText: "",
    });
    expect(result.warningsBadge).toBe("⚠ 1 warning");
  });

  it("returns warnings badge plural", () => {
    const result = formatEditResultText({
      isError: false,
      diff: "@@ -1,1 +1,1 @@\n-a\n+b",
      warnings: ["warning1", "warning2", "warning3"],
      noopEdits: [],
      errorText: "",
    });
    expect(result.warningsBadge).toBe("⚠ 3 warnings");
  });

  it("returns error text for non-noop errors", () => {
    const result = formatEditResultText({
      isError: true,
      diff: "",
      warnings: [],
      noopEdits: [],
      errorText: "File not found: src/missing.ts",
    });
    expect(result.noOp).toBe(false);
    expect(result.errorText).toBe("File not found: src/missing.ts");
  });

  it("returns empty diff stats when diff is empty", () => {
    const result = formatEditResultText({
      isError: false,
      diff: "",
      warnings: [],
      noopEdits: [],
      errorText: "",
    });
    expect(result.diffStats).toBeUndefined();
  });
});

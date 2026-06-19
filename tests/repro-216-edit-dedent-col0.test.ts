import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";

describe("issue 216 — dedent a line to column 0 via anchored edits", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("set_line dedents a tab-indented line to column 0", () => {
    const origContent = ["function foo() {", "\t\tnested();", "}"].join("\n");
    const anchor = `2:${computeLineHash(2, "\t\tnested();")}`;
    const result = applyHashlineEdits(origContent, [
      { set_line: { anchor, new_text: "dedented();" } },
    ]);
    expect(result.content.split("\n")[1]).toBe("dedented();");
  });

  it("set_line dedents a space-indented line to column 0", () => {
    const origContent = ["function foo() {", "    nested();", "}"].join("\n");
    const anchor = `2:${computeLineHash(2, "    nested();")}`;
    const result = applyHashlineEdits(origContent, [
      { set_line: { anchor, new_text: "dedented();" } },
    ]);
    expect(result.content.split("\n")[1]).toBe("dedented();");
  });

  it("replace_lines (single-target) dedents a tab-indented line to column 0", () => {
    const origContent = ["class C {", "\tmethod() {}", "}"].join("\n");
    const anchor = `2:${computeLineHash(2, "\tmethod() {}")}`;
    const result = applyHashlineEdits(origContent, [
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: "topLevel();" } },
    ]);
    expect(result.content.split("\n")[1]).toBe("topLevel();");
  });

  it("still restores indentation when a wrapped (multi-line) new_text collapses back to one line", () => {
    // Wrap/split case: original is one indented line; model emits it across 2 lines with no indent.
    // restoreOldWrappedLines collapses them, and restoreIndentPaired must keep the original indent.
    const origContent = ["function f() {", "\tconst summary = alpha + beta + gamma;", "}"].join("\n");
    const anchor = `2:${computeLineHash(2, "\tconst summary = alpha + beta + gamma;")}`;
    const newText = ["const summary = alpha + beta +", "gamma;"].join("\n");
    const result = applyHashlineEdits(origContent, [
      { set_line: { anchor, new_text: newText } },
    ]);
    // The wrap is restored to the original single indented line (no-op).
    expect(result.content.split("\n")[1]).toBe("\tconst summary = alpha + beta + gamma;");
  });
});

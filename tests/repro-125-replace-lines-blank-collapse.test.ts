import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash } from "../src/hashline.js";

describe("issue 125: replace_lines blank-line collapse in new_text", () => {
  beforeAll(async () => {
  });

  it("preserves explicit blank paragraph separator in new_text", () => {
    const origContent = [
      "Some intro.",
      "    Previously, the system did X.",
      "End.",
    ].join("\n");

    const anchor = `2:${computeLineHash(2, "    Previously, the system did X.")}`;
    const newText = ["", "Previously, the system did X."].join("\n");

    const result = applyHashlineEdits(origContent, [
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: newText } },
    ]);

    const expected = [
      "Some intro.",
      "",
      "Previously, the system did X.",
      "End.",
    ].join("\n");

    expect(result.content).toBe(expected);
  });

  it("does not steal leading whitespace from replaced old line", () => {
    const origContent = [
      "Heading",
      "        Old line with lots of leading whitespace.",
    ].join("\n");

    const anchor = `2:${computeLineHash(2, "        Old line with lots of leading whitespace.")}`;
    const newText = ["", "Old line with lots of leading whitespace."].join("\n");

    const result = applyHashlineEdits(origContent, [
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: newText } },
    ]);

    const expected = [
      "Heading",
      "",
      "Old line with lots of leading whitespace.",
    ].join("\n");

    expect(result.content).toBe(expected);
  });

  it("multi-paragraph new_text with shared paragraph text keeps blank separators", () => {
    const origContent = [
      "A",
      "    Previously, things worked.",
      "B",
    ].join("\n");

    const anchor = `2:${computeLineHash(2, "    Previously, things worked.")}`;
    const newText = [
      "Now, things work differently.",
      "",
      "Previously, things worked.",
    ].join("\n");

    const result = applyHashlineEdits(origContent, [
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: newText } },
    ]);

    const expected = [
      "A",
      "Now, things work differently.",
      "",
      "Previously, things worked.",
      "B",
    ].join("\n");

    expect(result.content).toBe(expected);
  });

  it("keeps the blank separator in a mixed batch where another edit succeeds", () => {
    const origContent = [
      "const one = 1;",
      "    Previously, the system did X.",
      "Tail",
    ].join("\n");

    const anchor1 = `1:${computeLineHash(1, "const one = 1;")}`;
    const anchor2 = `2:${computeLineHash(2, "    Previously, the system did X.")}`;

    const result = applyHashlineEdits(origContent, [
      { set_line: { anchor: anchor1, new_text: "const one = 11;" } },
      {
        replace_lines: {
          start_anchor: anchor2,
          end_anchor: anchor2,
          new_text: ["", "Previously, the system did X."].join("\n"),
        },
      },
    ]);

    expect(result.noopEdits).toBeUndefined();
    expect(result.content).toBe([
      "const one = 11;",
      "",
      "Previously, the system did X.",
      "Tail",
    ].join("\n"));
  });

  it("still restores a true soft wrap when no blank lines are involved", () => {
    const origContent = [
      "const summary = alpha + beta + gamma;",
      "tail();",
    ].join("\n");

    const anchor = `1:${computeLineHash(1, "const summary = alpha + beta + gamma;")}`;
    const newText = [
      "const summary = alpha + beta +",
      "gamma;",
    ].join("\n");

    const result = applyHashlineEdits(origContent, [
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: newText } },
    ]);

    expect(result.content).toBe(origContent);
    expect(result.noopEdits).toEqual([
      {
        editIndex: 0,
        loc: anchor,
        currentContent: "const summary = alpha + beta + gamma;",
      },
    ]);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { normalizeToLF, restoreLineEndings } from "../src/edit-diff.js";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";

describe("issue 230 — insert_after batch semantics", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  const orderingCases = [
    {
      name: "original reproduction",
      content: ["anchor", "tail"].join("\n"),
      anchorLine: 1,
      anchorText: "anchor",
      first: "first",
      second: "second",
      expected: ["anchor", "first", "second", "tail"].join("\n"),
      lineEnding: "\n" as const,
    },
    {
      name: "auto-relocated anchor",
      content: ["prefix", "target", "tail"].join("\n"),
      anchorLine: 1,
      anchorText: "target",
      first: "first",
      second: "second",
      expected: ["prefix", "target", "first", "second", "tail"].join("\n"),
      lineEnding: "\n" as const,
    },
    {
      name: "multi-line payloads",
      content: ["anchor", "tail"].join("\n"),
      anchorLine: 1,
      anchorText: "anchor",
      first: "one-a\none-b\n",
      second: "two-a\ntwo-b",
      expected: ["anchor", "one-a", "one-b", "two-a", "two-b", "tail"].join("\n"),
      lineEnding: "\n" as const,
    },
    {
      name: "EOF without final newline",
      content: ["head", "tail"].join("\n"),
      anchorLine: 2,
      anchorText: "tail",
      first: "first\n",
      second: "second",
      expected: ["head", "tail", "first", "second"].join("\n"),
      lineEnding: "\n" as const,
    },
    {
      name: "EOF with final newline",
      content: "head\ntail\n",
      anchorLine: 2,
      anchorText: "tail",
      first: "first",
      second: "second\n",
      expected: "head\ntail\nfirst\nsecond\n",
      lineEnding: "\n" as const,
    },
    {
      name: "normalized CRLF",
      content: "head\r\ntail\r\n",
      anchorLine: 1,
      anchorText: "head",
      first: "first-a\r\nfirst-b\r\n",
      second: "second-a\r\nsecond-b",
      expected: "head\r\nfirst-a\r\nfirst-b\r\nsecond-a\r\nsecond-b\r\ntail\r\n",
      lineEnding: "\r\n" as const,
    },
  ];

  it.each(orderingCases)(
    "preserves request order for distinct insertions sharing one anchor: $name",
    ({ content, anchorLine, anchorText, first, second, expected, lineEnding }) => {
      const normalized = normalizeToLF(content);
      const anchor = `${anchorLine}:${computeLineHash(anchorLine, anchorText)}`;
      const result = applyHashlineEdits(normalized, [
        { insert_after: { anchor, new_text: first } },
        { insert_after: { anchor, new_text: second } },
      ]);
      const rendered = lineEnding === "\r\n" ? restoreLineEndings(result.content, lineEnding) : result.content;

      expect(rendered).toBe(expected);
    },
  );

  it("keeps insertions at different anchors in bottom-up coordinate order", () => {
    const content = ["A", "B", "C"].join("\n");
    const result = applyHashlineEdits(content, [
      { insert_after: { anchor: `1:${computeLineHash(1, "A")}`, new_text: "after A" } },
      { insert_after: { anchor: `3:${computeLineHash(3, "C")}`, new_text: "after C" } },
    ]);

    expect(result.content).toBe(["A", "after A", "B", "C", "after C"].join("\n"));
  });

  it("applies identical same-anchor insertions once", () => {
    const content = ["anchor", "tail"].join("\n");
    const anchor = `1:${computeLineHash(1, "anchor")}`;
    const result = applyHashlineEdits(content, [
      { insert_after: { anchor, new_text: "first" } },
      { insert_after: { anchor, new_text: "first" } },
    ]);

    expect(result.content).toBe(["anchor", "first", "tail"].join("\n"));
    expect(result.warnings).toBeUndefined();
  });

  it("retains set/range precedence while ordering same-anchor insertions", () => {
    const content = ["A", "B", "C", "D"].join("\n");
    const bAnchor = `2:${computeLineHash(2, "B")}`;
    const result = applyHashlineEdits(content, [
      { insert_after: { anchor: bAnchor, new_text: "after B first" } },
      { set_line: { anchor: bAnchor, new_text: "B changed" } },
      { insert_after: { anchor: bAnchor, new_text: "after B second" } },
      {
        replace_lines: {
          start_anchor: `3:${computeLineHash(3, "C")}`,
          end_anchor: `4:${computeLineHash(4, "D")}`,
          new_text: "C-D changed",
        },
      },
    ]);

    expect(result.content).toBe(
      ["A", "B changed", "after B first", "after B second", "C-D changed"].join("\n"),
    );
  });


  it("preserves request order at the synthetic empty-file anchor", () => {
    const emptyAnchor = `1:${computeLineHash(1, "")}`;

    const result = applyHashlineEdits("", [
      { insert_after: { anchor: emptyAnchor, new_text: "first" } },
      { insert_after: { anchor: emptyAnchor, new_text: "second" } },
    ]);
    expect(result.content).toBe("first\nsecond");
    expect(result.firstChangedLine).toBe(1);

    const multilineResult = applyHashlineEdits("", [
      { insert_after: { anchor: emptyAnchor, new_text: "one-a\none-b" } },
      { insert_after: { anchor: emptyAnchor, new_text: "two-a\ntwo-b" } },
    ]);
    expect(multilineResult.content).toBe("one-a\none-b\ntwo-a\ntwo-b");

    const mixedResult = applyHashlineEdits("", [
      { insert_after: { anchor: emptyAnchor, new_text: "after base" } },
      { set_line: { anchor: emptyAnchor, new_text: "base" } },
    ]);
    expect(mixedResult.content).toBe("base\nafter base");
  });


  it("does not report unchanged shifted lines as unintended reformatting", () => {
    const lines = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`);
    const content = lines.join("\n");
    const firstAnchor = `1:${computeLineHash(1, lines[0])}`;

    const insertionResult = applyHashlineEdits(content, [
      { insert_after: { anchor: firstAnchor, new_text: "inserted" } },
    ]);
    expect(insertionResult.content).toBe([lines[0], "inserted", ...lines.slice(1)].join("\n"));
    expect(insertionResult.warnings).toBeUndefined();

    const deletionResult = applyHashlineEdits(content, [
      { set_line: { anchor: firstAnchor, new_text: "" } },
    ]);
    expect(deletionResult.content).toBe(lines.slice(1).join("\n"));
    expect(deletionResult.warnings).toBeUndefined();

    const rewrittenLines = lines.map((line) => `${line} changed`);
    const rewriteResult = applyHashlineEdits(content, [
      {
        replace_lines: {
          start_anchor: firstAnchor,
          end_anchor: `10:${computeLineHash(10, lines[9])}`,
          new_text: rewrittenLines.join("\n"),
        },
      },
    ]);
    expect(rewriteResult.content).toBe(rewrittenLines.join("\n"));
    expect(rewriteResult.warnings).toEqual([
      "Edit changed 10 lines across 1 operations — verify no unintended reformatting.",
    ]);
  });
});
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyHashlineEdits,
  computeLineHash,
  ensureHashInit,
  type HashlineEditItem,
} from "../src/hashline.js";

describe("issue 238 — overlapping anchored edits", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("rejects intersecting destructive targets after relocation", () => {
    const reproduction = ["one", "last request", "three"].join("\n");
    expect(() =>
      applyHashlineEdits(reproduction, [
        {
          replace_lines: {
            start_anchor: `1:${computeLineHash(1, "one")}`,
            end_anchor: `3:${computeLineHash(3, "three")}`,
            new_text: "whole range",
          },
        },
        {
          set_line: {
            anchor: `2:${computeLineHash(2, "last request")}`,
            new_text: "inside",
          },
        },
      ]),
    ).toThrow(
      "Overlapping anchored edits are not allowed: edits[0] targets lines 1-3 and edits[1] targets line 2.",
    );

    const content = ["A", "B", "C", "D", "E"].join("\n");
    const anchor = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;
    const overlapping: HashlineEditItem[][] = [
      [
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(3, "C"), new_text: "LEFT" } },
        { replace_lines: { start_anchor: anchor(3, "C"), end_anchor: anchor(4, "D"), new_text: "RIGHT" } },
      ],
      [
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(4, "D"), new_text: "OUTER" } },
        { replace_lines: { start_anchor: anchor(2, "B"), end_anchor: anchor(3, "C"), new_text: "INNER" } },
      ],
      [
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(3, "C"), new_text: "" } },
        { set_line: { anchor: anchor(2, "B"), new_text: "INNER" } },
      ],
      [
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(3, "C"), new_text: "FIRST" } },
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(3, "C"), new_text: "SECOND" } },
      ],
    ];
    for (const edits of overlapping) {
      expect(() => applyHashlineEdits(content, edits)).toThrow(/Overlapping anchored edits are not allowed/);
    }

    const relocatedIntoRange: HashlineEditItem[] = [
      { replace_lines: { start_anchor: anchor(2, "B"), end_anchor: anchor(4, "D"), new_text: "RANGE" } },
      { set_line: { anchor: `1:${computeLineHash(3, "C")}`, new_text: "RELOCATED" } },
    ];
    expect(() => applyHashlineEdits(content, relocatedIntoRange)).toThrow(
      "Overlapping anchored edits are not allowed: edits[0] targets lines 2-4 and edits[1] targets line 3.",
    );

    const adjacent = applyHashlineEdits(content, [
      { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(2, "B"), new_text: "AB" } },
      { replace_lines: { start_anchor: anchor(3, "C"), end_anchor: anchor(4, "D"), new_text: "CD" } },
    ]);
    expect(adjacent.content).toBe(["AB", "CD", "E"].join("\n"));
  });
});

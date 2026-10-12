import { beforeAll, describe, expect, it } from "vitest";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => {
  await ensureHashInit();
});

const ref = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;

describe("applyHashlineEdits lineMap", () => {
  it("maps each original line to its new line after inserting an identical line", () => {
    const res = applyHashlineEdits("a\n}\nb", [{ insert_after: { anchor: ref(1, "a"), new_text: "}" } }]);
    expect(res.content).toBe("a\n}\n}\nb");
    expect(res.lineMap).toEqual([1, 3, 4]);
  });

  it("leaves replaced and deleted lines unmapped", () => {
    const res = applyHashlineEdits("a\nb\nc\nd", [
      { set_line: { anchor: ref(2, "b"), new_text: "B" } },
      { set_line: { anchor: ref(4, "d"), new_text: "" } },
    ]);
    expect(res.content).toBe("a\nB\nc");
    expect(res.lineMap).toEqual([1, undefined, 3, undefined]);
  });

  it("is the identity when there are no edits", () => {
    expect(applyHashlineEdits("a\nb", []).lineMap).toEqual([1, 2]);
  });
});

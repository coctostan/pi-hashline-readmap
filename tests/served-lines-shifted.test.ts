import { beforeAll, describe, expect, it } from "vitest";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { ServedLines } from "../src/served-lines.js";

beforeAll(async () => {
  await ensureHashInit();
});

const rows = (lines: string[]) => lines.map((raw, index) => ({ line: index + 1, hash: computeLineHash(index + 1, raw) }));
const h = (text: string) => computeLineHash(1, text);

describe("ServedLines shifted anchors", () => {
  it("maps anchors shown before a line-shifting write to their new lines", () => {
    const served = new ServedLines();
    const before = ["a", "}", "}", "b"];
    const after = ["a", "x", "}", "}", "b"];
    served.record("/f", rows(before), true);
    served.remapAfterWrite("/f", before, after, [1, 3, 4, 5]);
    expect(served.shiftedAnchor("/f", 2, h("}"))).toBe(3);
    expect(served.shiftedAnchor("/f", 3, h("}"))).toBe(4);
    expect(served.shiftedAnchor("/f", 4, h("b"))).toBe(5);
    expect(served.shiftedAnchor("/f", 1, h("a"))).toBeUndefined();
  });

  it("marks anchors of lines the write replaced or removed as gone", () => {
    const served = new ServedLines();
    const before = ["a", "}", "}", "}", "b"];
    const after = ["a", "}", "}", "b"];
    served.record("/f", rows(before), true);
    served.remapAfterWrite("/f", before, after, [1, 2, undefined, 3, 4]);
    expect(served.shiftedAnchor("/f", 3, h("}"))).toBeNull();
    expect(served.shiftedAnchor("/f", 4, h("}"))).toBe(3);
  });

  it("derives the mapping from a line diff when no exact map is given", () => {
    const served = new ServedLines();
    const before = ["a", "b", "c"];
    const after = ["a", "x", "b", "c"];
    served.record("/f", rows(before), true);
    served.remapAfterWrite("/f", before, after);
    expect(served.shiftedAnchor("/f", 2, h("b"))).toBe(3);
    expect(served.shiftedAnchor("/f", 3, h("c"))).toBe(4);
  });

  it("composes successive writes and marks conflicting mappings as gone", () => {
    const served = new ServedLines();
    const v0 = ["a", "}", "}", "b"];
    const v1 = ["a", "x", "}", "}", "b"];
    const v2 = ["a", "x", "y", "}", "}", "b"];
    served.record("/f", rows(v0), true);
    served.remapAfterWrite("/f", v0, v1, [1, 3, 4, 5]);
    served.remapAfterWrite("/f", v1, v2, [1, 2, 4, 5, 6]);
    expect(served.shiftedAnchor("/f", 2, h("}"))).toBe(4);
    expect(served.shiftedAnchor("/f", 3, h("}"))).toBeNull();
    expect(served.shiftedAnchor("/f", 4, h("}"))).toBe(5);
  });

  it("keeps carrying served hashes to their new lines", () => {
    const served = new ServedLines();
    const before = ["a", "b"];
    const after = ["a", "x", "b"];
    served.record("/f", rows(before), true);
    served.remapAfterWrite("/f", before, after, [1, 3]);
    expect(served.findStale("/f", after, [1, 2, 3])).toEqual([]);
  });
});

describe("ServedLines shifted anchors after re-serving", () => {
  function shiftedFixture() {
    const served = new ServedLines();
    const before = ["a", "}", "}", "b"];
    const after = ["a", "x", "}", "}", "b"];
    served.record("/f", rows(before), true);
    served.remapAfterWrite("/f", before, after, [1, 3, 4, 5]);
    return { served, after };
  }

  it("forgets a shifted anchor once that row is shown again", () => {
    const { served } = shiftedFixture();
    served.record("/f", [{ line: 3, hash: h("}") }]);
    expect(served.shiftedAnchor("/f", 3, h("}"))).toBeUndefined();
    expect(served.shiftedAnchor("/f", 2, h("}"))).toBe(3);
  });

  it("forgets every shifted anchor after a complete view", () => {
    const { served, after } = shiftedFixture();
    served.record("/f", rows(after), true);
    expect(served.shiftedAnchor("/f", 2, h("}"))).toBeUndefined();
    expect(served.shiftedAnchor("/f", 4, h("b"))).toBeUndefined();
  });

  it("forget() drops shifted anchors", () => {
    const { served } = shiftedFixture();
    served.forget("/f");
    expect(served.shiftedAnchor("/f", 2, h("}"))).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { mergeRanges, type SgRange } from "../src/sg";

describe("sg range merging", () => {
  it("merges overlapping ranges (10-20 + 15-25 → 10-25)", () => {
    const ranges: SgRange[] = [
      { startLine: 10, endLine: 20 },
      { startLine: 15, endLine: 25 },
    ];
    const merged = mergeRanges(ranges);
    expect(merged).toEqual([{ startLine: 10, endLine: 25 }]);
  });

  it("merges adjacent ranges with gap ≤ 1 (10-20 + 22-30 → 10-30)", () => {
    const ranges: SgRange[] = [
      { startLine: 10, endLine: 20 },
      { startLine: 22, endLine: 30 },
    ];
    const merged = mergeRanges(ranges);
    expect(merged).toEqual([{ startLine: 10, endLine: 30 }]);
  });

  it("keeps non-overlapping ranges separate (gap > 1)", () => {
    const ranges: SgRange[] = [
      { startLine: 10, endLine: 20 },
      { startLine: 23, endLine: 30 },
    ];
    const merged = mergeRanges(ranges);
    expect(merged).toEqual([
      { startLine: 10, endLine: 20 },
      { startLine: 23, endLine: 30 },
    ]);
  });

  it("handles unsorted input by sorting first", () => {
    const ranges: SgRange[] = [
      { startLine: 30, endLine: 40 },
      { startLine: 10, endLine: 20 },
      { startLine: 15, endLine: 25 },
    ];
    const merged = mergeRanges(ranges);
    expect(merged).toEqual([
      { startLine: 10, endLine: 25 },
      { startLine: 30, endLine: 40 },
    ]);
  });

  it("merges three overlapping ranges into one", () => {
    const ranges: SgRange[] = [
      { startLine: 1, endLine: 10 },
      { startLine: 5, endLine: 15 },
      { startLine: 12, endLine: 20 },
    ];
    const merged = mergeRanges(ranges);
    expect(merged).toEqual([{ startLine: 1, endLine: 20 }]);
  });

  it("single range passes through unchanged", () => {
    const ranges: SgRange[] = [{ startLine: 5, endLine: 10 }];
    const merged = mergeRanges(ranges);
    expect(merged).toEqual([{ startLine: 5, endLine: 10 }]);
  });

  it("empty input returns empty", () => {
    expect(mergeRanges([])).toEqual([]);
  });
});

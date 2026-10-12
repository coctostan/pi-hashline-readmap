import { describe, expect, it } from "vitest";
import { computeCharWindow, DEFAULT_CHAR_LIMIT, MAX_CHAR_LIMIT, safeCharEnd } from "../src/read-window.js";

describe("computeCharWindow", () => {
  it("exports the documented limits", () => {
    expect(DEFAULT_CHAR_LIMIT).toBe(500);
    expect(MAX_CHAR_LIMIT).toBe(10_000);
  });

  it("slices [start, start+limit) and reports remaining and next offset", () => {
    expect(computeCharWindow("abcdefghij", 2, 4)).toEqual({
      start: 2, end: 6, total: 10, remaining: 4, nextCharOffset: 6, text: "cdef",
    });
  });

  it("returns the tail with no next offset", () => {
    expect(computeCharWindow("abcdefghij", 8, 500)).toEqual({
      start: 8, end: 10, total: 10, remaining: 0, nextCharOffset: null, text: "ij",
    });
  });

  it("moves a start that lands inside a surrogate pair back to the pair start", () => {
    // "a😀b" = a, high, low, b (length 4); offset 2 is the low surrogate.
    expect(computeCharWindow("a😀b", 2, 2)).toEqual({
      start: 1, end: 3, total: 4, remaining: 1, nextCharOffset: 3, text: "😀",
    });
  });

  it("trims an end that would split a surrogate pair", () => {
    expect(computeCharWindow("a😀b", 0, 2)).toEqual({
      start: 0, end: 1, total: 4, remaining: 3, nextCharOffset: 1, text: "a",
    });
  });

  it("extends to include the pair when trimming would leave the window empty", () => {
    expect(computeCharWindow("😀b", 0, 1)).toEqual({
      start: 0, end: 2, total: 3, remaining: 1, nextCharOffset: 2, text: "😀",
    });
  });

  it("safeCharEnd only pulls back when the end is between a high and a low surrogate", () => {
    expect(safeCharEnd("a😀b", 2)).toBe(1);
    expect(safeCharEnd("a😀b", 3)).toBe(3);
    expect(safeCharEnd("abc", 2)).toBe(2);
  });
});

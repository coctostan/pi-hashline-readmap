import { describe, it, expect, beforeAll } from "vitest";
import { computeLineHash, hashLines } from "../src/hashline.js";

const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

describe("Bug #052: hashLines output escapes control characters", () => {
  beforeAll(async () => {
  });

  it("hashLines renders escaped display text while preserving raw hashes", () => {
    const content = "alpha\nline with \x07 bell\nomega";
    const output = hashLines(content);
    const lines = output.split("\n");

    expect(lines[1]).toBe(`2:${computeLineHash(2, "line with \x07 bell")}|line with \\u0007 bell`);
    expect(CONTROL_CHAR_RE.test(output)).toBe(false);
  });
});

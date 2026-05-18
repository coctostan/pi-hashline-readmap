import { describe, it, expect, beforeAll } from "vitest";
import { computeLineHash, hashLine } from "../src/hashline.js";

const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

describe("Bug #052: hashLine output escapes control characters", () => {
  beforeAll(async () => {
  });

  it("hashLine renders escaped display text while preserving raw hashes", () => {
    const rawLine = "line with \x07 bell";
    const output = hashLine(12, rawLine);

    expect(output).toBe(`12:${computeLineHash(12, rawLine)}|line with \\u0007 bell`);
    expect(CONTROL_CHAR_RE.test(output)).toBe(false);
  });
});

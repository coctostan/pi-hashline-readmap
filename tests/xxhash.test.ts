import { describe, it, expect } from "vitest";
import { computeLineHash, hashLine, hashLines } from "../src/hashline";

describe("@node-rs/xxhash", () => {
  it("computeLineHash returns 3-char hex (AC 4, 5)", () => {
    const hash = computeLineHash(1, "hello world");
    expect(hash).toMatch(/^[0-9a-f]{3}$/);
    // Deterministic: same input → same output
    expect(computeLineHash(1, "hello world")).toBe(hash);
  });

  it("hashLine produces LINE:HASH|content format (AC 6)", () => {
    const result = hashLine(12, "hello");
    expect(result).toMatch(/^12:[0-9a-f]{3}\|hello$/);
  });

  it("hashLines produces sequential 1-indexed LINE:HASH|content entries (AC 7)", () => {
    const content = "line one\nline two\nline three";
    const result = hashLines(content);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1:[0-9a-f]{3}\|line one$/);
    expect(lines[1]).toMatch(/^2:[0-9a-f]{3}\|line two$/);
    expect(lines[2]).toMatch(/^3:[0-9a-f]{3}\|line three$/);
  });
});

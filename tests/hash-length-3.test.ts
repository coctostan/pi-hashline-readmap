import { describe, it, expect, beforeAll } from "vitest";
import { computeLineHash, parseLineRef } from "../src/hashline.js";

describe("HASH_LEN = 3", () => {
  beforeAll(async () => {
  });

  it("produces 3-character hashes", () => {
    const hash = computeLineHash(1, "hello world");
    expect(hash).toHaveLength(3);
    expect(hash).toMatch(/^[0-9a-f]{3}$/);
  });

  it("parseLineRef accepts 3-character hashes", () => {
    const hash = computeLineHash(1, "hello world");
    const ref = parseLineRef(`1:${hash}|hello world`);
    expect(ref.line).toBe(1);
    expect(ref.hash).toBe(hash);
  });

  it("parseLineRef rejects 2-character hashes", () => {
    expect(() => parseLineRef("1:ab|content")).toThrow(/Invalid line reference/);
  });
});

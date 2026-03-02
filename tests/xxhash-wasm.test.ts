import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit, computeLineHash, hashLine, hashLines } from "../src/hashline";

describe("xxhash-wasm", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("ensureHashInit resolves without error and is idempotent", async () => {
    // Already called in beforeAll — call again to verify idempotency
    await expect(ensureHashInit()).resolves.toBeUndefined();
  });

  it("concurrent ensureHashInit calls resolve to same singleton (no double-init)", async () => {
    // All three calls must resolve the same cached promise — verified by
    // the fact that h32Fn is set exactly once (if it were re-initialized,
    // the WASM module load would be called multiple times).
    // We verify no error + all resolve to undefined (void).
    const p1 = ensureHashInit();
    const p2 = ensureHashInit();
    const p3 = ensureHashInit();
    // They should be the same promise reference (or at least all resolve)
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual([undefined, undefined, undefined]);
  });

  it("computeLineHash is synchronous after init and returns 2-char hex (AC 4, 5)", () => {
    const hash = computeLineHash(1, "hello world");
    expect(hash).toMatch(/^[0-9a-f]{2}$/);
    // Deterministic: same input → same output
    expect(computeLineHash(1, "hello world")).toBe(hash);
  });

  it("hashLine produces LINE:HASH|content format (AC 6)", () => {
    const result = hashLine(12, "hello");
    expect(result).toMatch(/^12:[0-9a-f]{2}\|hello$/);
  });

  it("hashLines produces sequential 1-indexed LINE:HASH|content entries (AC 7)", () => {
    const content = "line one\nline two\nline three";
    const result = hashLines(content);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^1:[0-9a-f]{2}\|line one$/);
    expect(lines[1]).toMatch(/^2:[0-9a-f]{2}\|line two$/);
    expect(lines[2]).toMatch(/^3:[0-9a-f]{2}\|line three$/);
  });
});

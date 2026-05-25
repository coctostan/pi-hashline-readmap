import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit, applyHashlineEdits, computeLineHash, HashlineMismatchError } from "../src/hashline.js";

describe("repro 199 — hash-mismatch message leads with explicit rejection", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("states the edit was rejected and nothing written, before the churn detail", () => {
    const orig = ["const a = 1;", "const b = 22;", "const c = 3;"].join("\n");
    const staleAnchor = `2:${computeLineHash(2, "const b = 2;")}`;
    let caught: unknown;
    try {
      applyHashlineEdits(
        orig,
        [{ set_line: { anchor: staleAnchor, new_text: "const b = 222;" } }],
        new AbortController().signal,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HashlineMismatchError);
    const message = (caught as HashlineMismatchError).message;
    expect(message.startsWith("Edit rejected")).toBe(true);
    expect(message).toContain("nothing was written");
    expect(message).toContain("anchor hash did not match");
    // Backward-compatible: existing churn phrasing and >>> markers remain.
    expect(message).toContain("changed since last read");
    expect(message).toContain(">>>");
  });
});

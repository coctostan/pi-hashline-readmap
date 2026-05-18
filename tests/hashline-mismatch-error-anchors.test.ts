import { describe, it, expect, beforeAll } from "vitest";
import {
  applyHashlineEdits,
  computeLineHash,
  HashlineMismatchError,
} from "../src/hashline.js";

describe("HashlineMismatchError exposes updatedAnchors", () => {
  beforeAll(async () => {
  });

  it("attaches PtcLine[] updatedAnchors for changed lines while preserving message text", () => {
    const current = ["const a = 1;", "const b = 22;", "const c = 3;"].join("\n");
    const staleAnchorForLine2 = `2:${computeLineHash(2, "const b = 2;")}`;

    let caught: unknown;
    try {
      applyHashlineEdits(current, [{ set_line: { anchor: staleAnchorForLine2, new_text: "const b = 222;" } }]);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HashlineMismatchError);
    const err = caught as HashlineMismatchError;
    expect(err.message).toContain("changed since last read");
    expect(Array.isArray(err.updatedAnchors)).toBe(true);
    expect(err.updatedAnchors.length).toBeGreaterThan(0);
    const changed = err.updatedAnchors.find((a) => a.line === 2);
    expect(changed).toBeDefined();
    expect(changed!.hash).toBe(computeLineHash(2, "const b = 22;"));
    expect(changed!.anchor).toBe(`2:${changed!.hash}`);
    expect(changed!.raw).toBe("const b = 22;");
    expect(typeof changed!.display).toBe("string");
  });
});

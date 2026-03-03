import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, ensureHashInit, computeLineHash } from "../src/hashline.js";

describe("Feature #030b: Did you mean? suggestions on anchor mismatch", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("includes 'Did you mean?' with LINE:HASH|content suggestions when anchor mismatches", () => {
    // File content where line 3 has been edited since last read
    const content = [
      "const a = 1;",
      "const b = 2;",
      "const c = 3; // modified",  // was "const c = 3;" when agent last read
      "const d = 4;",
      "const e = 5;",
      "function foo() {",
      "  return a + b;",
      "}",
    ].join("\n");

    // Agent passes anchor with |content suffix (as copied from read output)
    const staleHash = computeLineHash(3, "const c = 3;");

    try {
      applyHashlineEdits(content, [
        { set_line: { anchor: `3:${staleHash}|const c = 3;`, new_text: "const c = 99;" } }
      ]);
      expect.unreachable("Should have thrown mismatch error");
    } catch (err: any) {
      expect(err.message).toContain("changed since last read");
      // Must contain "Did you mean?" section
      expect(err.message).toContain("Did you mean");
      // Must suggest line(s) with LINE:HASH|content format
      expect(err.message).toMatch(/\d+:[0-9a-f]{2}\|/);
      // Should suggest line 3 which has similar content "const c = 3; // modified"
      expect(err.message).toContain("const c = 3;");
    }
  });

  it("does NOT show 'Did you mean?' when auto-relocation succeeds", () => {
    const content = [
      "line A",
      "inserted line",
      "line B",    // was at line 2, now at line 3
      "line C",
    ].join("\n");

    const hashB = computeLineHash(2, "line B");

    // Should auto-relocate from line 2 to line 3 — no error
    const result = applyHashlineEdits(content, [
      { set_line: { anchor: `2:${hashB}`, new_text: "line B modified" } }
    ]);

    expect(result.content).toContain("line B modified");
  });

  it("does NOT show 'Did you mean?' when no |content in anchor (no expected text to compare)", () => {
    const content = [
      "const a = 1;",
      "const b = 2;",
      "const c = 3; // modified",
    ].join("\n");

    const staleHash = computeLineHash(3, "const c = 3;");

    try {
      applyHashlineEdits(content, [
        { set_line: { anchor: `3:${staleHash}`, new_text: "const c = 99;" } }
      ]);
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("changed since last read");
      // Without |content, no basis for similarity — no "Did you mean?"
      expect(err.message).not.toContain("Did you mean");
    }
  });

  it("limits suggestions to at most 3 candidates", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `const var${i} = ${i};`);
    const content = lines.join("\n");
    const staleHash = computeLineHash(5, "const varX = 99;");

    try {
      applyHashlineEdits(content, [
        { set_line: { anchor: `5:${staleHash}|const varX = 99;`, new_text: "const varX = 100;" } }
      ]);
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("Did you mean");
      // Extract suggestion lines (indented, after "Did you mean")
      const didYouMeanIdx = err.message.indexOf("Did you mean");
      const afterSection = err.message.slice(didYouMeanIdx);
      const suggestionLines = afterSection
        .split("\n")
        .filter((l: string) => /^\s+\d+:[0-9a-f]{2}\|/.test(l));
      expect(suggestionLines.length).toBeLessThanOrEqual(3);
      expect(suggestionLines.length).toBeGreaterThanOrEqual(1);
    }
  });
});

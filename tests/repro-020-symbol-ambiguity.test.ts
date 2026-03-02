/**
 * Reproduction test for Bug #020:
 * Ambiguity message for top-level symbol collisions suggests "dot notation"
 * which is a dead end — dot notation only works for ClassName.methodName,
 * not for two top-level functions with the same name.
 */
import { describe, it, expect } from "vitest";
import { findSymbol } from "../src/readmap/symbol-lookup.js";
import type { FileMap } from "../src/readmap/types.js";

// Synthetic FileMap with two top-level add() functions (overloads)
const fileMapWithOverloads: FileMap = {
  path: "/tmp/sample.ts",
  language: "typescript",
  totalLines: 11,
  totalBytes: 200,
  imports: [],
  detailLevel: "full" as any,
  symbols: [
    {
      name: "add",
      kind: "function" as any,
      startLine: 1,
      endLine: 3,
      children: [],
    },
    {
      name: "add",
      kind: "function" as any,
      startLine: 5,
      endLine: 7,
      children: [],
    },
    {
      name: "multiply",
      kind: "function" as any,
      startLine: 9,
      endLine: 11,
      children: [],
    },
  ],
};

describe("Bug #020: symbol ambiguity message misleads with dot notation for top-level collisions", () => {
  it("returns ambiguous for two top-level add() symbols", () => {
    const result = findSymbol(fileMapWithOverloads, "add");
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("FAILS: dot notation suggestion is a dead end — add.0 and add#1 are not-found", () => {
    // The current message says "Use dot notation (e.g. ClassName.methodName) to narrow"
    // But for top-level overloads, there is NO dot notation that disambiguates.
    // This test shows the suggestion is unusable.
    
    const dotResult = findSymbol(fileMapWithOverloads, "add.0");
    const hashResult = findSymbol(fileMapWithOverloads, "add#1");
    const lineResult = findSymbol(fileMapWithOverloads, "add@1");

    // Current behavior: all return not-found — there is NO supported syntax
    // to pick one of two top-level overloads
    // Expected after fix: at least one addressing scheme should work
    expect(lineResult.type).not.toBe("not-found");  // FAILS until name@LINE syntax is supported
  });

  it("FAILS: read.ts ambiguity message contains actionable disambiguation for top-level overloads", () => {
    // The read.ts code currently returns:
    //   "Use dot notation to disambiguate."
    // But dot notation can't help here. The message should either:
    //   (a) Not suggest dot notation when all candidates are top-level
    //   (b) Suggest a valid scheme like add#1 or add@5
    const result = findSymbol(fileMapWithOverloads, "add");
    expect(result.type).toBe("ambiguous");
    
    if (result.type === "ambiguous") {
      // Verify at least one addressing scheme works to resolve the ambiguity
      // Try line-based: "add" at line 1 vs line 5
      const byLine1 = findSymbol(fileMapWithOverloads, "add@1");
      const byLine5 = findSymbol(fileMapWithOverloads, "add@5");
      const byIndex1 = findSymbol(fileMapWithOverloads, "add#1");
      const byIndex2 = findSymbol(fileMapWithOverloads, "add#2");
      
      const anyWorks =
        byLine1.type === "found" || byLine5.type === "found" ||
        byIndex1.type === "found" || byIndex2.type === "found";
      
      expect(anyWorks).toBe(true); // FAILS: no disambiguation scheme exists yet
    }
  });
});

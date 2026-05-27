import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mapperFiles = [
  "src/readmap/mappers/rust.ts",
  "src/readmap/mappers/cpp.ts",
  "src/readmap/mappers/java.ts",
] as const;

describe("tree-sitter helper extraction (#202)", () => {
  for (const rel of mapperFiles) {
    it(`${rel} no longer defines normalizeWhitespace/getNodeText/getLineRange locally`, () => {
      const src = readFileSync(resolve(rel), "utf8");
      expect(src).not.toMatch(/function\s+normalizeWhitespace\s*\(/);
      expect(src).not.toMatch(/function\s+getNodeText\s*\(/);
      expect(src).not.toMatch(/function\s+getLineRange\s*\(/);
    });

    it(`${rel} imports from tree-sitter-helpers.js`, () => {
      const src = readFileSync(resolve(rel), "utf8");
      expect(src).toContain("./tree-sitter-helpers.js");
    });
  }

  it("parser-loader.ts is unchanged by this refactor (no tree-sitter-helpers import)", () => {
    const src = readFileSync(resolve("src/readmap/parser-loader.ts"), "utf8");
    expect(src).not.toContain("tree-sitter-helpers");
  });
});

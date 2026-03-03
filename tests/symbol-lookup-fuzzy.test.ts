import { describe, it, expect } from "vitest";
import type { FileMap } from "../src/readmap/types.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { findSymbol } from "../src/readmap/symbol-lookup.js";

function makeMap(symbols: FileMap["symbols"]): FileMap {
  return {
    path: "/tmp/test.ts",
    totalLines: 100,
    totalBytes: 1000,
    language: "typescript",
    symbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  };
}

describe("findSymbol ranked fuzzy matching (task 7)", () => {
  it("exact match wins over prefix and substring", () => {
    const map = makeMap([
      { name: "parse", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
      { name: "canParse", kind: SymbolKind.Function, startLine: 5, endLine: 6 },
    ]);

    expect(findSymbol(map, "parse")).toEqual({
      type: "found",
      symbol: { name: "parse", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("case-insensitive exact wins over prefix", () => {
    const map = makeMap([
      { name: "Parse", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "parse")).toEqual({
      type: "found",
      symbol: { name: "Parse", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("prefix wins over substring", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "canparse", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "parse")).toEqual({
      type: "found",
      symbol: { name: "parseConfig", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("camelCase boundary match: config matches parseConfig", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "myconfigvalue", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "config")).toEqual({
      type: "found",
      symbol: { name: "parseConfig", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("ambiguity returns at most 5 candidates", () => {
    const map = makeMap([
      { name: "parse", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "parse", kind: SymbolKind.Method, startLine: 3, endLine: 4 },
      { name: "parse", kind: SymbolKind.Method, startLine: 5, endLine: 6 },
      { name: "parse", kind: SymbolKind.Method, startLine: 7, endLine: 8 },
      { name: "parse", kind: SymbolKind.Method, startLine: 9, endLine: 10 },
      { name: "parse", kind: SymbolKind.Method, startLine: 11, endLine: 12 },
    ]);

    const result = findSymbol(map, "parse");
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(5);
    }
  });

  it("returns not-found when no tier matches", () => {
    const map = makeMap([
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "serializeData", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "missing")).toEqual({ type: "not-found" });
  });
});

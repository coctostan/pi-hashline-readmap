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

describe("findSymbol", () => {
  it("returns not-found for a missing symbol name", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
    ]);

    expect(findSymbol(map, "doesNotExist")).toEqual({ type: "not-found" });
  });

  it("returns not-found when map has no symbols", () => {
    const map = makeMap([]);
    expect(findSymbol(map, "anything")).toEqual({ type: "not-found" });
  });

  it("returns found for an exact single-name match", () => {
    const map = makeMap([
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
    ]);

    expect(findSymbol(map, "parseConfig")).toEqual({
      type: "found",
      symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
    });
  });

  it("returns exact-tier ambiguity only when exact has multiple matches", () => {
    const map = makeMap([
      { name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 10 },
      { name: "init", kind: SymbolKind.Method, startLine: 32, endLine: 40 },
      { name: "initialize", kind: SymbolKind.Function, startLine: 60, endLine: 90 },
    ]);

    expect(findSymbol(map, "init")).toEqual({
      type: "ambiguous",
      candidates: [
        { name: "init", kind: "method", startLine: 3, endLine: 10 },
        { name: "init", kind: "method", startLine: 32, endLine: 40 },
      ],
    });
  });
});

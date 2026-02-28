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
});

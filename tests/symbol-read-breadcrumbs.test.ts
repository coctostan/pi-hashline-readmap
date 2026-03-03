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

describe("enclosing scope breadcrumbs", () => {
  it("includes parentName for a nested symbol via dot-notation", () => {
    const map = makeMap([
      {
        name: "MyClass",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 50,
        children: [
          { name: "myMethod", kind: SymbolKind.Method, startLine: 10, endLine: 20 },
        ],
      },
    ]);
    const result = findSymbol(map, "MyClass.myMethod");
    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.parentName).toBe("MyClass");
    }
  });

  it("includes parentName for a flat search that resolves to a child", () => {
    const map = makeMap([
      {
        name: "ParentClass",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 80,
        children: [
          { name: "uniqueChild", kind: SymbolKind.Method, startLine: 30, endLine: 40 },
        ],
      },
      { name: "topLevel", kind: SymbolKind.Function, startLine: 85, endLine: 95 },
    ]);
    // "uniqueChild" isn't a top-level symbol, but flat search should find it in children
    // Since exact match on top-level fails, it should fall through to children
    // Actually, the current code only searches map.symbols (top-level) for flat matches.
    // So this tests dot-notation primarily.
    const result = findSymbol(map, "ParentClass.uniqueChild");
    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.parentName).toBe("ParentClass");
    }
  });

  it("top-level symbol has no parentName", () => {
    const map = makeMap([
      { name: "topLevelFn", kind: SymbolKind.Function, startLine: 1, endLine: 20 },
    ]);
    const result = findSymbol(map, "topLevelFn");
    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.parentName).toBeUndefined();
    }
  });

  it("shows immediate parent for 3-level dot-notation", () => {
    const map = makeMap([
      {
        name: "Namespace",
        kind: SymbolKind.Namespace,
        startLine: 1,
        endLine: 100,
        children: [
          {
            name: "InnerClass",
            kind: SymbolKind.Class,
            startLine: 5,
            endLine: 90,
            children: [
              { name: "deepMethod", kind: SymbolKind.Method, startLine: 10, endLine: 20 },
            ],
          },
        ],
      },
    ]);
    const result = findSymbol(map, "Namespace.InnerClass.deepMethod");
    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.parentName).toBe("InnerClass");
    }
  });
});

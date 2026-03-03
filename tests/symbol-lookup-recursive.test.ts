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

describe("findSymbol recursive dot-notation (task 6)", () => {
  it("resolves 3-level path Namespace.Class.method", () => {
    const map = makeMap([
      {
        name: "Namespace",
        kind: SymbolKind.Namespace,
        startLine: 1,
        endLine: 100,
        children: [
          {
            name: "Class",
            kind: SymbolKind.Class,
            startLine: 10,
            endLine: 80,
            children: [{ name: "method", kind: SymbolKind.Method, startLine: 20, endLine: 30 }],
          },
        ],
      },
    ]);

    expect(findSymbol(map, "Namespace.Class.method")).toMatchObject({
      type: "found",
      symbol: { name: "method", kind: "method", startLine: 20, endLine: 30 },
    });
  });

  it("resolves dot-path segments with surrounding whitespace", () => {
    const map = makeMap([
      {
        name: "Namespace",
        kind: SymbolKind.Namespace,
        startLine: 1,
        endLine: 100,
        children: [
          {
            name: "Class",
            kind: SymbolKind.Class,
            startLine: 10,
            endLine: 80,
            children: [{ name: "method", kind: SymbolKind.Method, startLine: 20, endLine: 30 }],
          },
        ],
      },
    ]);

    expect(findSymbol(map, "Namespace. Class . method")).toMatchObject({
      type: "found",
      symbol: { name: "method", kind: "method", startLine: 20, endLine: 30 },
    });
  });

  it("resolves 4-level path", () => {
    const map = makeMap([
      {
        name: "A",
        kind: SymbolKind.Namespace,
        startLine: 1,
        endLine: 100,
        children: [
          {
            name: "B",
            kind: SymbolKind.Namespace,
            startLine: 5,
            endLine: 90,
            children: [
              {
                name: "C",
                kind: SymbolKind.Class,
                startLine: 10,
                endLine: 80,
                children: [
                  { name: "run", kind: SymbolKind.Method, startLine: 40, endLine: 50 },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(findSymbol(map, "A.B.C.run")).toMatchObject({
      type: "found",
      symbol: { name: "run", kind: "method", startLine: 40, endLine: 50 },
    });
  });

  it("keeps 2-level compatibility", () => {
    const map = makeMap([
      {
        name: "Manager",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 20,
        children: [{ name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 5 }],
      },
    ]);

    expect(findSymbol(map, "Manager.init")).toMatchObject({
      type: "found",
      symbol: { name: "init", kind: "method", startLine: 3, endLine: 5 },
    });
  });

  it("falls through to flat search if dot-path does not resolve", () => {
    const map = makeMap([
      {
        name: "Manager",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 20,
        children: [{ name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 5 }],
      },
      { name: "manager.init.extra", kind: SymbolKind.Function, startLine: 50, endLine: 60 },
    ]);

    expect(findSymbol(map, "manager.init.extra")).toMatchObject({
      type: "found",
      symbol: { name: "manager.init.extra", kind: "function", startLine: 50, endLine: 60 },
    });
  });

  it("returns ambiguous if multiple children match at leaf level", () => {
    const map = makeMap([
      {
        name: "Namespace",
        kind: SymbolKind.Namespace,
        startLine: 1,
        endLine: 100,
        children: [
          {
            name: "Class",
            kind: SymbolKind.Class,
            startLine: 10,
            endLine: 80,
            children: [
              { name: "method", kind: SymbolKind.Method, startLine: 20, endLine: 25 },
              { name: "method", kind: SymbolKind.Method, startLine: 40, endLine: 45 },
            ],
          },
        ],
      },
    ]);

    expect(findSymbol(map, "Namespace.Class.method")).toMatchObject({
      type: "ambiguous",
      candidates: [
        { name: "method", kind: "method", startLine: 20, endLine: 25 },
        { name: "method", kind: "method", startLine: 40, endLine: 45 },
      ],
    });
  });
});

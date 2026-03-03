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

  it("matches child symbol via ClassName.methodName", () => {
    const map = makeMap([
      {
        name: "UserDirectory",
        kind: SymbolKind.Class,
        startLine: 13,
        endLine: 38,
        children: [{ name: "addUser", kind: SymbolKind.Method, startLine: 20, endLine: 33 }],
      },
    ]);

    expect(findSymbol(map, "UserDirectory.addUser")).toMatchObject({
      type: "found",
      symbol: { name: "addUser", kind: "method", startLine: 20, endLine: 33 },
    });
  });

  it("returns ambiguous for dot-notation when multiple children match", () => {
    const map = makeMap([
      {
        name: "Manager",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 20,
        children: [
          { name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 5 },
          { name: "init", kind: SymbolKind.Method, startLine: 10, endLine: 12 },
        ],
      },
    ]);

    expect(findSymbol(map, "Manager.init")).toMatchObject({
      type: "ambiguous",
      candidates: [
        { name: "init", kind: "method", startLine: 3, endLine: 5 },
        { name: "init", kind: "method", startLine: 10, endLine: 12 },
      ],
    });
  });

  it("does not match dot-notation queries with more than one dot segment", () => {
    const map = makeMap([
      {
        name: "Manager",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 20,
        children: [{ name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 5 }],
      },
    ]);

    expect(findSymbol(map, "Manager.init.extra")).toEqual({ type: "not-found" });
  });

  it("falls back to case-insensitive match when no exact match exists", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
      { name: "parseConfigHelper", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
    ]);

    expect(findSymbol(map, "PARSECONFIG")).toEqual({
      type: "found",
      symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
    });
  });

  it("returns ambiguous when case-insensitive tier has multiple matches", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
      { name: "PARSECONFIG", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
    ]);

    expect(findSymbol(map, "parseconfig")).toEqual({
      type: "ambiguous",
      candidates: [
        { name: "parseConfig", kind: "function", startLine: 10, endLine: 20 },
        { name: "PARSECONFIG", kind: "function", startLine: 30, endLine: 40 },
      ],
    });
  });

  it("returns found when partial tier has exactly one match", () => {
    const map = makeMap([
      { name: "createDemoDirectory", kind: SymbolKind.Function, startLine: 45, endLine: 49 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 60, endLine: 70 },
    ]);

    expect(findSymbol(map, "createDemo")).toEqual({
      type: "found",
      symbol: { name: "createDemoDirectory", kind: "function", startLine: 45, endLine: 49 },
    });
  });

  it("returns ambiguous when partial tier has multiple matches", () => {
    const map = makeMap([
      { name: "processData", kind: SymbolKind.Function, startLine: 1, endLine: 10 },
      { name: "processInput", kind: SymbolKind.Function, startLine: 12, endLine: 22 },
    ]);

    expect(findSymbol(map, "process")).toEqual({
      type: "ambiguous",
      candidates: [
        { name: "processData", kind: "function", startLine: 1, endLine: 10 },
        { name: "processInput", kind: "function", startLine: 12, endLine: 22 },
      ],
    });
  });

  it("returns not-found for empty or whitespace query", () => {
    const map = makeMap([
      { name: "   ", kind: SymbolKind.Function, startLine: 1, endLine: 1 },
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
    ]);

    expect(findSymbol(map, "   ")).toEqual({ type: "not-found" });
  });
});

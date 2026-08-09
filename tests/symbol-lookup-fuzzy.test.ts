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

    expect(findSymbol(map, "parse")).toMatchObject({
      type: "found",
      symbol: { name: "parse", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("case-insensitive exact wins over prefix", () => {
    const map = makeMap([
      { name: "Parse", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "parse")).toMatchObject({
      type: "found",
      symbol: { name: "Parse", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("prefix wins over substring", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "canparse", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "parse")).toMatchObject({
      type: "fuzzy",
      tier: "prefix",
      symbol: { name: "parseConfig", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("prefix beats a camelCase candidate for the same query", () => {
    const map = makeMap([
      { name: "handlerConfig", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "getHandler", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "handler")).toMatchObject({
      type: "fuzzy",
      tier: "prefix",
      symbol: { name: "handlerConfig", kind: "function", startLine: 1, endLine: 2 },
    });
  });

  it("preserves prefix identity for a unique abbreviated query", () => {
    const map = makeMap([
      { name: "longPayload", kind: SymbolKind.Function, startLine: 1, endLine: 3 },
    ]);

    expect(findSymbol(map, "longPay")).toMatchObject({
      type: "fuzzy",
      tier: "prefix",
      symbol: expect.objectContaining({ name: "longPayload" }),
    });
  });
  it("multiple camelCase matches stay ambiguous before substring fallback", () => {
    const map = makeMap([
      { name: "getHandler", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
      { name: "setHandler", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
      { name: "myhandlerthing", kind: SymbolKind.Function, startLine: 50, endLine: 60 },
    ]);

    expect(findSymbol(map, "handler")).toMatchObject({
      type: "ambiguous",
      tier: "camelCase",
      candidates: [
        { name: "getHandler", kind: "function", startLine: 10, endLine: 20 },
        { name: "setHandler", kind: "function", startLine: 30, endLine: 40 },
      ],
    });
  });

  it("camelCase boundary match: config matches parseConfig returns fuzzy", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "myconfigvalue", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    const result = findSymbol(map, "config");
    expect(result.type).toBe("fuzzy");
    if (result.type === "fuzzy") {
      expect(result.symbol).toEqual({ name: "parseConfig", kind: "function", startLine: 1, endLine: 2 });
      expect(result.tier).toBe("camelCase");
      expect(Array.isArray(result.otherCandidates)).toBe(true);
    }
  });

  it("substring match: single tier-4 hit returns fuzzy with tier substring", () => {
    const map = makeMap([
      { name: "initGetters", kind: SymbolKind.Function, startLine: 42, endLine: 58 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 60, endLine: 70 },
    ]);

    const result = findSymbol(map, "get");
    expect(result.type).toBe("fuzzy");
    if (result.type === "fuzzy") {
      expect(result.symbol).toEqual({ name: "initGetters", kind: "function", startLine: 42, endLine: 58 });
      expect(result.tier).toBe("substring");
    }
  });

  it("fuzzy tier 3 (camelCase) returns up to 4 other candidates from merged tier-3+tier-4 pool", () => {
    const map = makeMap([
      { name: "getHandler", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
      { name: "myhandlerthing", kind: SymbolKind.Function, startLine: 30, endLine: 35 },
      { name: "prehandlerX", kind: SymbolKind.Function, startLine: 40, endLine: 45 },
      { name: "ahandlerB", kind: SymbolKind.Function, startLine: 50, endLine: 55 },
      { name: "xhandlerY", kind: SymbolKind.Function, startLine: 60, endLine: 65 },
      { name: "zhandlerQ", kind: SymbolKind.Function, startLine: 70, endLine: 75 },
    ]);

    const result = findSymbol(map, "handler");
    expect(result.type).toBe("fuzzy");
    if (result.type === "fuzzy") {
      expect(result.symbol.name).toBe("getHandler");
      expect(result.tier).toBe("camelCase");
      expect(result.otherCandidates.length).toBeLessThanOrEqual(4);
      expect(result.otherCandidates.length).toBeGreaterThan(0);
      expect(result.otherCandidates.every((c) => c.name !== "getHandler")).toBe(true);
    }
  });

  it("fuzzy tier 4 with a single overall substring hit returns empty otherCandidates", () => {
    const map = makeMap([
      { name: "initGetters", kind: SymbolKind.Function, startLine: 42, endLine: 58 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 60, endLine: 70 },
    ]);

    const result = findSymbol(map, "get");
    expect(result.type).toBe("fuzzy");
    if (result.type === "fuzzy") {
      expect(result.tier).toBe("substring");
      expect(result.otherCandidates).toEqual([]);
    }
  });

  it("exact ambiguity keeps all candidates", () => {
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
      expect(result.candidates).toHaveLength(6);
    }
  });

  it("preserves all exact ambiguity candidates", () => {
    const result = findSymbol(
      makeMap(Array.from({ length: 8 }, (_, i) => ({
        name: "process",
        kind: SymbolKind.Method,
        startLine: i * 2 + 1,
        endLine: i * 2 + 2,
      }))),
      "process",
    );
    expect(result).toMatchObject({ type: "ambiguous", tier: "exact" });
    if (result.type === "ambiguous") expect(result.candidates).toHaveLength(8);
  });

  it("preserves all prefix ambiguity candidates", () => {
    const map = makeMap(Array.from({ length: 6 }, (_, i) => ({
      name: `processWorker${i}`,
      kind: SymbolKind.Method,
      startLine: i + 1,
      endLine: i + 1,
    })));
    const result = findSymbol(map, "process");
    expect(result).toMatchObject({ type: "ambiguous", tier: "prefix" });
    if (result.type === "ambiguous") expect(result.candidates).toHaveLength(6);
  });

  it("preserves all normalized-exact ambiguity candidates", () => {
    const names = ["PROCESS", "Process", "pROCESS", "prOCESS", "proCESS", "procESS"];
    const result = findSymbol(
      makeMap(names.map((name, i) => ({
        name,
        kind: SymbolKind.Method,
        startLine: i + 1,
        endLine: i + 1,
      }))),
      "process",
    );
    expect(result).toMatchObject({ type: "ambiguous", tier: "normalized-exact" });
    if (result.type === "ambiguous") expect(result.candidates).toHaveLength(6);
  });

  it("preserves all camelCase ambiguity candidates", () => {
    const names = [
      "getHandler",
      "setHandler",
      "runHandler",
      "stopHandler",
      "openHandler",
      "closeHandler",
    ];
    const result = findSymbol(
      makeMap(names.map((name, i) => ({
        name,
        kind: SymbolKind.Method,
        startLine: i + 1,
        endLine: i + 1,
      }))),
      "handler",
    );
    expect(result).toMatchObject({ type: "ambiguous", tier: "camelCase" });
    if (result.type === "ambiguous") expect(result.candidates).toHaveLength(6);
  });

  it("preserves all substring ambiguity candidates", () => {
    const result = findSymbol(
      makeMap(Array.from({ length: 6 }, (_, i) => ({
        name: `beforeprocess${i}`,
        kind: SymbolKind.Method,
        startLine: i + 1,
        endLine: i + 1,
      }))),
      "process",
    );
    expect(result).toMatchObject({ type: "ambiguous", tier: "substring" });
    if (result.type === "ambiguous") expect(result.candidates).toHaveLength(6);
  });

  it("returns not-found when no tier matches", () => {
    const map = makeMap([
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      { name: "serializeData", kind: SymbolKind.Function, startLine: 3, endLine: 4 },
    ]);

    expect(findSymbol(map, "missing")).toEqual({ type: "not-found" });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clearMapCache } from "../src/map-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
  symbol?: string;
};

async function getReadTool() {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = {
    registerTool(def: any) {
      capturedTool = def;
    },
  };
  registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool;
}

async function callReadTool(params: ReadParams) {
  const tool = await getReadTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("read — fuzzy symbol match (issue 099)", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("tier 4 substring: returns content AND prepends fuzzy banner AND emits fuzzy-symbol-match warning", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "initGetters", kind: SymbolKind.Function, startLine: 45, endLine: 49 },
        { name: "formatOutput", kind: SymbolKind.Function, startLine: 60, endLine: 70 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "get",
    });

    const text = getTextContent(result);

    expect(text).toContain("[Symbol 'get' not exact-matched");
    expect(text).toContain("initGetters");
    expect(text).toContain("substring");
    expect(text).toContain("[Symbol: initGetters (function)");

    const warnings = (result.details as any)?.ptcValue?.warnings ?? [];
    expect(warnings.some((w: any) => w.code === "fuzzy-symbol-match")).toBe(true);
  });

  it("tier 3 camelCase: returns content AND prepends fuzzy banner with camelCase tier", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "getHandler", kind: SymbolKind.Function, startLine: 45, endLine: 49 },
        { name: "formatOutput", kind: SymbolKind.Function, startLine: 60, endLine: 70 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "handler",
    });

    const text = getTextContent(result);
    expect(text).toContain("[Symbol 'handler' not exact-matched");
    expect(text).toContain("getHandler");
    expect(text).toContain("camelCase");
    expect(text).toContain("[Symbol: getHandler (function)");

    const warnings = (result.details as any)?.ptcValue?.warnings ?? [];
    expect(warnings.some((w: any) => w.code === "fuzzy-symbol-match")).toBe(true);
  });

  it("tier 1 case-insensitive exact — no fuzzy banner (silent)", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "ParseConfig", kind: SymbolKind.Function, startLine: 1, endLine: 2 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "parseconfig",
    });

    const text = getTextContent(result);
    expect(text).not.toContain("not exact-matched");
    const warnings = (result.details as any)?.ptcValue?.warnings ?? [];
    expect(warnings.some((w: any) => w.code === "fuzzy-symbol-match")).toBe(false);
  });

  it("fuzzy banner lists otherCandidates when cross-tier alternatives exist", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "getHandler", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
        { name: "myhandlerthing", kind: SymbolKind.Function, startLine: 30, endLine: 35 },
        { name: "prehandlerX", kind: SymbolKind.Function, startLine: 40, endLine: 45 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "handler",
    });

    const text = getTextContent(result);
    expect(text).toContain("Other candidates:");
    expect(text).toContain("myhandlerthing");
    expect(text).toContain("prehandlerX");
    expect(text).toContain("To confirm:");
    expect(text).toContain("getHandler@10");
    const warnings = (result.details as any)?.ptcValue?.warnings ?? [];
    const fuzzyWarning = warnings.find((w: any) => w.code === "fuzzy-symbol-match");
    expect(fuzzyWarning?.message).toContain("Other candidates: `myhandlerthing`, `prehandlerX`.");
    expect(fuzzyWarning?.message).toContain("To confirm: read({ symbol: \"getHandler\" }) or getHandler@10");
  });

  it("fuzzy warning exposes machine-readable tier and otherCandidates", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "getHandler", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
        { name: "myhandlerthing", kind: SymbolKind.Function, startLine: 30, endLine: 35 },
        { name: "prehandlerX", kind: SymbolKind.Function, startLine: 40, endLine: 45 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "handler",
    });

    const warnings = (result.details as any)?.ptcValue?.warnings ?? [];
    const fuzzyWarning = warnings.find((w: any) => w.code === "fuzzy-symbol-match");

    expect(fuzzyWarning).toMatchObject({
      code: "fuzzy-symbol-match",
      tier: "camelCase",
      otherCandidates: [
        { name: "myhandlerthing", kind: "function", startLine: 30, endLine: 35 },
        { name: "prehandlerX", kind: "function", startLine: 40, endLine: 45 },
      ],
    });
  });

  it("labels a prefix fallback with its actual tier", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");
    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 100,
      totalBytes: 1000,
      language: "typescript",
      imports: [],
      detailLevel: DetailLevel.Full,
      symbols: [{ name: "longPayload", kind: SymbolKind.Function, startLine: 1, endLine: 2 }],
    });
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "longPay",
    });
    const warning = ((result.details as any)?.ptcValue?.warnings ?? [])
      .find((entry: any) => entry.code === "fuzzy-symbol-match");
    expect(getTextContent(result)).toContain("via prefix");
    expect(warning).toMatchObject({
      code: "fuzzy-symbol-match",
      tier: "prefix",
      symbol: { name: "longPayload" },
    });
  });

  it("reports exact metadata without a fuzzy warning", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");
    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 10,
      totalBytes: 100,
      language: "typescript",
      imports: [],
      detailLevel: DetailLevel.Full,
      symbols: [{ name: "longPayload", kind: SymbolKind.Function, startLine: 1, endLine: 2 }],
    });
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "longPayload",
    });
    expect((result.details as any).ptcValue.symbol).toMatchObject({
      name: "longPayload",
      tier: "exact",
    });
    expect(
      ((result.details as any).ptcValue.warnings ?? [])
        .some((warning: any) => warning.code === "fuzzy-symbol-match"),
    ).toBe(false);
  });

  it("reports normalized-exact metadata without a fuzzy warning", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");
    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: resolve(fixturesDir, "small.ts"),
      totalLines: 10,
      totalBytes: 100,
      language: "typescript",
      imports: [],
      detailLevel: DetailLevel.Full,
      symbols: [{ name: "longPayload", kind: SymbolKind.Function, startLine: 1, endLine: 2 }],
    });
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "LONGPAYLOAD",
    });
    expect((result.details as any).ptcValue.symbol).toMatchObject({
      name: "longPayload",
      tier: "normalized-exact",
    });
    expect(
      ((result.details as any).ptcValue.warnings ?? [])
        .some((warning: any) => warning.code === "fuzzy-symbol-match"),
    ).toBe(false);
  });

  it("caps an accepted fuzzy match while preserving its warning and full symbol metadata", async () => {
    const cacheModule = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");
    const filePath = resolve(fixturesDir, "small.ts");

    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
      path: filePath,
      totalLines: 49,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "getHandler", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
        { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 35 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callReadTool({ path: filePath, symbol: "handler", limit: 3 });
    const text = getTextContent(result);
    const emittedLines = text
      .split("\n")
      .flatMap((line) => {
        const match = line.match(/^(\d+):[0-9a-f]{3}\|/);
        return match ? [Number(match[1])] : [];
      });
    const fuzzyWarning = (result.details.ptcValue.warnings ?? [])
      .find((warning: any) => warning.code === "fuzzy-symbol-match");

    expect(emittedLines).toEqual([10, 11, 12]);
    expect(result.details.ptcValue.range).toEqual({ startLine: 10, endLine: 12, totalLines: 49 });
    expect(result.details.ptcValue.symbol).toMatchObject({
      query: "handler",
      name: "getHandler",
      startLine: 10,
      endLine: 20,
      tier: "camelCase",
    });
    expect(result.details.ptcValue.continuation).toEqual({ nextOffset: 13 });
    expect(fuzzyWarning).toMatchObject({
      code: "fuzzy-symbol-match",
      tier: "camelCase",
      symbol: { name: "getHandler", startLine: 10, endLine: 20 },
    });
    expect(text).toContain("[Symbol 'handler' not exact-matched");
  });
});

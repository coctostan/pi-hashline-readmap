import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";
import * as mapCacheModule from "../src/map-cache.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { registerReadTool } from "../src/read.js";

const tempDirs: string[] = [];

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
  symbol?: string;
};

function makeLine(index: number): string {
  const prefix = `export const value${String(index).padStart(3, "0")} = "`;
  const suffix = `";`;
  return `${prefix}${"x".repeat(800 - prefix.length - suffix.length)}${suffix}`;
}

function getText(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

async function callRead(params: ReadParams) {
  let readTool: any;
  registerReadTool({ registerTool(tool: any) { readTool = tool; } } as any);
  return readTool.execute(
    "repro-232-continuation",
    params,
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

const cases: Array<{
  name: string;
  params: Omit<ReadParams, "path">;
  startLine: number;
}> = [
  { name: "default full-file read", params: {}, startLine: 1 },
  { name: "offset read", params: { offset: 51 }, startLine: 51 },
  { name: "limit read", params: { limit: 200 }, startLine: 1 },
  { name: "symbol read", params: { symbol: "HugeBlock" }, startLine: 51 },
];

describe("issue 232 — truncated continuation modes", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  beforeEach(() => {
    clearMapCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(cases)("continues after the emitted rows for a $name", async ({ params, startLine }) => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-232-continuation-"));
    tempDirs.push(dir);
    const filePath = resolve(dir, "long-lines.ts");
    const sourceLines = Array.from({ length: 300 }, (_, index) => makeLine(index + 1));
    writeFileSync(filePath, sourceLines.join("\n"), "utf-8");

    vi.spyOn(mapCacheModule, "getOrGenerateMap").mockResolvedValue({
      path: filePath,
      totalLines: 300,
      totalBytes: Buffer.byteLength(sourceLines.join("\n"), "utf8"),
      language: "typescript",
      symbols: [
        { name: "HugeBlock", kind: SymbolKind.Function, startLine: 51, endLine: 250 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const result = await callRead({ path: filePath, ...params });
    const text = getText(result);
    const emittedRows = text.match(/^\d+:[0-9a-f]{3}\|/gm)?.length ?? 0;
    const footer = text.match(
      /\[Output truncated: showing (\d+) of 300 lines .*Use offset=(\d+) to continue\.\]/,
    );

    expect({
      emittedRows,
      footerOutputLines: footer ? Number(footer[1]) : null,
      footerNextOffset: footer ? Number(footer[2]) : null,
      detailsOutputLines: result.details.truncation?.outputLines ?? null,
      ptcOutputLines: result.details.ptcValue.truncation?.outputLines ?? null,
    }).toEqual({
      emittedRows,
      footerOutputLines: emittedRows,
      footerNextOffset: startLine + emittedRows,
      detailsOutputLines: emittedRows,
      ptcOutputLines: emittedRows,
    });
  });
});

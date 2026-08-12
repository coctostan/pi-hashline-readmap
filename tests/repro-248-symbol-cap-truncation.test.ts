import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit } from "../src/hashline.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { registerReadTool } from "../src/read.js";
import * as mapCacheModule from "../src/map-cache.js";

const tempDirs: string[] = [];

function makeLine(index: number): string {
  const prefix = `export const value${String(index).padStart(3, "0")} = "`;
  const suffix = `";`;
  return `${prefix}${"x".repeat(800 - prefix.length - suffix.length)}${suffix}`;
}

async function callRead(path: string, limit: number) {
  let readTool: any;
  registerReadTool({ registerTool(tool: any) { readTool = tool; } } as any);
  return readTool.execute(
    "repro-248-symbol-cap-truncation",
    { path, symbol: "HugeBlock", limit },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

describe("issue 248 — capped symbol display truncation", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { label: "capped", limit: 150, selectedEnd: 200 },
    { label: "oversized", limit: 300, selectedEnd: 250 },
  ])("continues a $label symbol at the earliest undisplayed selected row", async ({ limit, selectedEnd }) => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-248-cap-truncation-"));
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

    const result = await callRead(filePath, limit);
    const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
    const emittedRows = text.match(/^\d+:[0-9a-f]{3}\|/gm)?.length ?? 0;
    const nextOffset = 51 + emittedRows;
    const expectedSelectedEnd = selectedEnd;
    const remainingSelected = expectedSelectedEnd - nextOffset + 1;

    expect(emittedRows).toBeGreaterThan(0);
    expect(emittedRows).toBeLessThan(Math.min(limit, 200));
    expect(result.details.ptcValue.range).toEqual({ startLine: 51, endLine: expectedSelectedEnd, totalLines: 300 });
    expect(result.details.ptcValue.truncation).not.toBeNull();
    expect(result.details.ptcValue.continuation).toEqual({ nextOffset });
    expect(text).toContain(
      `Continue with read({ path: ${JSON.stringify(filePath)}, offset: ${nextOffset}, limit: ${remainingSelected} }).`,
    );
    expect(text).not.toContain("offset=201");
  });
});

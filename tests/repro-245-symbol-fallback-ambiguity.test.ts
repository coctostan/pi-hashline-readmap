import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import type { FileMap, FileSymbol } from "../src/readmap/types.js";
import { findSymbol } from "../src/readmap/symbol-lookup.js";

const cleanup: string[] = [];

async function callRead(filePath: string, symbols: FileSymbol[], symbol: string) {
  const cacheModule = await import("../src/map-cache.js");
  vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
    path: filePath,
    totalLines: 20,
    totalBytes: 400,
    language: "typescript",
    symbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  } satisfies FileMap);

  const { registerReadTool } = await import("../src/read.js");
  let tool: any;
  registerReadTool({ registerTool(definition: any) { tool = definition; } } as any);
  return tool.execute(
    "repro-245",
    { path: filePath, symbol },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "repro-245-"));
  cleanup.push(dir);
  const filePath = join(dir, "sample.ts");
  await writeFile(filePath, Array.from({ length: 20 }, (_, index) => `// line ${index + 1}`).join("\n"));
  return filePath;
}

function text(result: any): string {
  return result.content.find((entry: any) => entry.type === "text")?.text ?? "";
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("issue #245 symbol fallback and ambiguity diagnostics", () => {
  it("warns when a unique TypeScript prefix query longPay resolves to longPayload", async () => {
    const filePath = await fixture();
    const result = await callRead(
      filePath,
      [{ name: "longPayload", kind: SymbolKind.Function, startLine: 1, endLine: 3 }],
      "longPay",
    );

    const warnings = result.details?.ptcValue?.warnings ?? [];
    expect({ output: text(result), warnings }).toMatchObject({
      output: expect.stringContaining("not exact-matched"),
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: "fuzzy-symbol-match" }),
      ]),
    });
  });

  it("lists all eight exact process candidates or reports how many were omitted", async () => {
    const filePath = await fixture();
    const symbols: FileSymbol[] = Array.from({ length: 8 }, (_, index) => ({
      name: `Worker${index + 1}`,
      kind: SymbolKind.Class,
      startLine: index * 2 + 1,
      endLine: index * 2 + 2,
      children: [{
        name: "process",
        kind: SymbolKind.Method,
        startLine: index * 2 + 1,
        endLine: index * 2 + 2,
      }],
    }));

    const map: FileMap = {
      path: filePath,
      totalLines: 20,
      totalBytes: 400,
      language: "typescript",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
    expect(findSymbol(map, "process@15")).toMatchObject({
      type: "found",
      symbol: { name: "process", parentName: "Worker8", startLine: 15, endLine: 16 },
    });

    const output = text(await callRead(filePath, symbols, "process"));
    const listsEveryCandidate = symbols.every((candidate) =>
      output.includes(`lines ${candidate.children![0].startLine}-${candidate.children![0].endLine}`),
    );
    const reportsThreeOmitted = /(?:3\s+(?:additional\s+)?candidates?\s+omitted|omitted\s+3)/i.test(output);

    expect(
      listsEveryCandidate || reportsThreeOmitted,
      `Ambiguity output neither lists all candidates nor reports omissions:\n${output}`,
    ).toBe(true);
  });
});

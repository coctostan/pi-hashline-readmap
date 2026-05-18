import { describe, expect, it, beforeAll } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFileResource, buildSymbolResource } from "../src/context-hygiene.js";
import { buildPtcLine } from "../src/ptc-value.js";
import { buildGrepOutput } from "../src/grep-output.js";
import { registerGrepTool } from "../src/grep.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callGrepTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("grep contextHygiene metadata", () => {
  beforeAll(async () => {
  });

  it("buildGrepOutput returns search-context metadata for matched files and scoped symbols", () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const matchLine = buildPtcLine(45, "export function createDemoDirectory(): UserDirectory {");
    const symbol = {
      name: "createDemoDirectory",
      kind: "function",
      startLine: 45,
      endLine: 49,
    };

    const output = buildGrepOutput({
      summary: false,
      totalMatches: 1,
      records: [{ path: filePath, kind: "match", ...matchLine }],
      groups: [
        {
          displayPath: "small.ts",
          absolutePath: filePath,
          matchCount: 1,
          entries: [{ kind: "match", line: matchLine }],
          scope: {
            mode: "symbol",
            symbol,
            matchLines: [45],
          },
        },
      ],
      scopeMode: "symbol",
    });

    expect((output as any).contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "grep",
      classification: "search-context",
      resources: [
        buildFileResource(filePath),
        buildSymbolResource(filePath, "createDemoDirectory", "function"),
      ],
    });
    expect((output.ptcValue as any).contextHygiene).toBeUndefined();
    expect(output.ptcValue.records).toEqual([
      { path: filePath, line: 45, anchor: matchLine.anchor, kind: "match" },
    ]);
  });

  it("grep tool attaches contextHygiene beside ptcValue without changing ptcValue", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callGrepTool({
      pattern: "createDemoDirectory",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: 0,
    });

    expect(result.details?.contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "grep",
      classification: "search-context",
      resources: [
        buildFileResource(filePath),
        buildSymbolResource(filePath, "createDemoDirectory", "function"),
      ],
      rehydrate: {
        tool: "grep",
        input: {
          pattern: "createDemoDirectory",
          path: filePath,
          literal: true,
          scope: "symbol",
          scopeContext: 0,
        },
      },
    });
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(result.details?.ptcValue.scopes.groups[0].symbol).toMatchObject({
      name: "createDemoDirectory",
      kind: "function",
      startLine: 45,
      endLine: 49,
    });
  });

  it("grep tool preserves optional call inputs in rehydrate metadata", async () => {
    const result = await callGrepTool({
      pattern: "createdemodirectory",
      path: fixturesDir,
      glob: "small.ts",
      literal: true,
      ignoreCase: true,
      context: 1,
      summary: true,
      limit: 20,
    });

    expect(result.details?.contextHygiene.rehydrate).toEqual({
      tool: "grep",
      input: {
        pattern: "createdemodirectory",
        path: fixturesDir,
        glob: "small.ts",
        literal: true,
        ignoreCase: true,
        context: 1,
        summary: true,
      },
    });
    expect((result.details?.contextHygiene.rehydrate.input as any).limit).toBeUndefined();
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
  });
});

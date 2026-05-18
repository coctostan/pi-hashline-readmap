import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFileResource, buildSymbolResource } from "../src/context-hygiene.js";
import { buildReadOutput } from "../src/read-output.js";
import { registerReadTool } from "../src/read.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callReadTool(params: {
  path: string;
  offset?: number;
  limit?: number;
  symbol?: string;
  map?: boolean;
  bundle?: "local";
}) {
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("read contextHygiene metadata", () => {
  beforeAll(async () => {
  });

  it("buildReadOutput returns additive read-context metadata for file and symbol resources", () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const selectedLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n").slice(44);
    const symbol = {
      query: "createDemoDirectory",
      name: "createDemoDirectory",
      kind: "function",
      parentName: undefined,
      startLine: 45,
      endLine: 49,
    };

    const built = buildReadOutput({
      path: filePath,
      startLine: 45,
      endLine: 49,
      totalLines: 49,
      selectedLines,
      symbol,
    });

    expect((built as any).contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "read",
      classification: "read-context",
      resources: [
        buildFileResource(filePath),
        buildSymbolResource(filePath, "createDemoDirectory", "function"),
      ],
    });
    expect(built.text).toMatch(/^\[Symbol: createDemoDirectory \(function\), lines 45-49 of 49\]/);
    expect((built.ptcValue as any).contextHygiene).toBeUndefined();
    expect(built.ptcValue.symbol).toEqual(symbol);
  });


  it("buildReadOutput includes applied local bundle support symbols in hygiene resources", () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const selectedLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n").slice(44);
    const symbol = {
      query: "createDemoDirectory",
      name: "createDemoDirectory",
      kind: "function",
      parentName: undefined,
      startLine: 45,
      endLine: 49,
    };

    const built = buildReadOutput({
      path: filePath,
      startLine: 45,
      endLine: 49,
      totalLines: 49,
      selectedLines,
      symbol,
      bundle: {
        mode: "local",
        applied: true,
        localSupport: [
          {
            symbol: {
              query: "UserDirectory",
              name: "UserDirectory",
              kind: "class",
              startLine: 13,
              endLine: 38,
            },
            lines: ["export class UserDirectory {"],
          },
        ],
      },
    });

    expect(built.contextHygiene.resources).toEqual([
      buildFileResource(filePath),
      buildSymbolResource(filePath, "createDemoDirectory", "function"),
      buildSymbolResource(filePath, "UserDirectory", "class"),
    ]);
    expect((built.ptcValue as any).contextHygiene).toBeUndefined();
  });

  it("read tool attaches contextHygiene beside ptcValue without changing rendered text", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({
      path: filePath,
      symbol: "createDemoDirectory",
      bundle: "local",
    });

    expect(result.details?.contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "read",
      classification: "read-context",
      resources: [
        buildFileResource(filePath),
        buildSymbolResource(filePath, "createDemoDirectory", "function"),
        buildSymbolResource(filePath, "addUser", "method"),
      ],
      rehydrate: {
        tool: "read",
        input: { path: filePath, symbol: "createDemoDirectory", bundle: "local" },
      },
    });
    expect(result.details?.ptcValue.symbol).toEqual({
      query: "createDemoDirectory",
      name: "createDemoDirectory",
      kind: "function",
      parentName: undefined,
      startLine: 45,
      endLine: 49,
    });
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(getTextContent(result)).toContain("## Requested symbol");
    expect(getTextContent(result)).toContain("[Symbol: createDemoDirectory (function), lines 45-49 of 49]");
  });

  it("read tool preserves optional call inputs in rehydrate metadata", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({ path: filePath, offset: 2, limit: 3, map: true });

    expect(result.details?.contextHygiene.rehydrate).toEqual({
      tool: "read",
      input: { path: filePath, offset: 2, limit: 3, map: true },
    });
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(getTextContent(result)).toContain("2:");
  });
});

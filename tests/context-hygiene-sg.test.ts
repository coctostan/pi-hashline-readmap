import { describe, expect, it, beforeAll, afterEach, vi } from "vitest";
import * as cp from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFileResource, buildSymbolResource } from "../src/context-hygiene.js";
import { buildPtcLine } from "../src/ptc-value.js";
import { buildSgOutput } from "../src/sg-output.js";
import { findEnclosingSgSymbols, registerSgTool } from "../src/sg.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: vi.fn(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callSgTool(params: Record<string, unknown>, debugEnv?: string) {
  const previous = process.env.PI_CONTEXT_HYGIENE_DEBUG;
  if (debugEnv === undefined) delete process.env.PI_CONTEXT_HYGIENE_DEBUG;
  else process.env.PI_CONTEXT_HYGIENE_DEBUG = debugEnv;
  try {
    let capturedTool: any = null;
    registerSgTool({ registerTool(def: any) { capturedTool = def; } } as any);
    if (!capturedTool) throw new Error("ast_search tool was not registered");
    return await capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
  } finally {
    if (previous === undefined) delete process.env.PI_CONTEXT_HYGIENE_DEBUG;
    else process.env.PI_CONTEXT_HYGIENE_DEBUG = previous;
  }
}

describe("ast_search contextHygiene metadata", () => {
  beforeAll(async () => {
  });

  afterEach(() => vi.restoreAllMocks());

  it("buildSgOutput returns search-context metadata for matched files and enclosing symbols", () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const matchLine = buildPtcLine(45, "export function createDemoDirectory(): UserDirectory {");

    const output = buildSgOutput({
      pattern: "export function $NAME($$$PARAMS) { $$$BODY }",
      files: [
        {
          displayPath: "tests/fixtures/small.ts",
          path: filePath,
          ranges: [{ startLine: 45, endLine: 49 }],
          lines: [matchLine],
          symbols: [{ name: "createDemoDirectory", kind: "function" }],
        },
      ],
    });

    expect((output as any).contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "ast_search",
      classification: "search-context",
      resources: [
        buildFileResource(filePath),
        buildSymbolResource(filePath, "createDemoDirectory", "function"),
      ],
    });
    expect((output.ptcValue as any).contextHygiene).toBeUndefined();
    expect(output.ptcValue.files[0]).toEqual({
      path: filePath,
      ranges: [{ startLine: 45, endLine: 49 }],
      lines: [matchLine],
    });
  });

  it("findEnclosingSgSymbols derives real symbols from readmap metadata", async () => {
    const filePath = resolve(fixturesDir, "small.ts");

    await expect(findEnclosingSgSymbols(filePath, [{ startLine: 45, endLine: 49 }])).resolves.toEqual([
      { name: "createDemoDirectory", kind: "function" },
    ]);
  });

  it("ast_search tool attaches contextHygiene beside ptcValue without changing ptcValue", async () => {
    const filePath = resolve(fixturesDir, "small.ts");

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify([
        { file: filePath, range: { start: { line: 44, column: 0 }, end: { line: 48, column: 0 } } },
      ]), "");
      return {} as any;
    });

    const result = await callSgTool({
      pattern: "export function $NAME($$$PARAMS) { $$$BODY }",
      lang: "typescript",
      path: filePath,
    });

    expect(result.details?.contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "ast_search",
      classification: "search-context",
      resources: [buildFileResource(filePath)],
      rehydrate: {
        tool: "ast_search",
        input: {
          pattern: "export function $NAME($$$PARAMS) { $$$BODY }",
          lang: "typescript",
          path: filePath,
        },
      },
    });
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(result.details?.ptcValue.files[0]).toMatchObject({
      path: filePath,
      ranges: [{ startLine: 45, endLine: 49 }],
    });
  });

  it("ast_search tool derives enclosing symbols before display range merging", async () => {
    const filePath = resolve(fixturesDir, "small.ts");

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify([
        { file: filePath, range: { start: { line: 19, column: 0 }, end: { line: 32, column: 0 } } },
        { file: filePath, range: { start: { line: 34, column: 0 }, end: { line: 36, column: 0 } } },
      ]), "");
      return {} as any;
    });

    const result = await callSgTool({
      pattern: "$METHOD($$$ARGS) { $$$BODY }",
      path: filePath,
    }, "1");

    expect(result.details?.contextHygiene.resources).toEqual([
      buildFileResource(filePath),
      buildSymbolResource(filePath, "addUser", "method"),
      buildSymbolResource(filePath, "getUser", "method"),
    ]);
    expect(result.details?.ptcValue.files[0].ranges).toEqual([{ startLine: 20, endLine: 37 }]);
  });
});

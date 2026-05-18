import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import * as cp from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("sg ptcValue", () => {
  beforeAll(async () => {
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns grouped structured results with merged ranges and anchored lines while keeping ast_search text unchanged", async () => {
    const tool = await getSgTool();
    const filePath = resolve(fixturesDir, "small.ts");
    const sourceLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n");

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify([
        { file: filePath, range: { start: { line: 44, column: 0 }, end: { line: 44, column: 0 } } },
        { file: filePath, range: { start: { line: 45, column: 0 }, end: { line: 48, column: 0 } } },
      ]), "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "export function $NAME($$$PARAMS) { $$$BODY }", path: filePath },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(ptc).toBeDefined();
    expect(ptc).toEqual({
      tool: "ast_search",
      files: [
        {
          path: filePath,
          ranges: [{ startLine: 45, endLine: 49 }],
          lines: [45, 46, 47, 48, 49].map((lineNumber) => {
            const raw = sourceLines[lineNumber - 1];
            const hash = computeLineHash(lineNumber, raw);
            return {
              line: lineNumber,
              hash,
              anchor: `${lineNumber}:${hash}`,
              raw,
              display: escapeControlCharsForDisplay(raw),
            };
          }),
        },
      ],
    });

    const expectedText = [
      `--- tests/fixtures/small.ts ---`,
      ...[45, 46, 47, 48, 49].map((lineNumber) => {
        const raw = sourceLines[lineNumber - 1];
        const hash = computeLineHash(lineNumber, raw);
        return `>>${lineNumber}:${hash}|${escapeControlCharsForDisplay(raw)}`;
      }),
    ].join("\n");

    expect(text).toBe(expectedText);
  });
});

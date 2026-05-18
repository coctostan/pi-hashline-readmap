import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";
import * as readModule from "../src/read.js";
import * as readOutputModule from "../src/read-output.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");
async function callReadTool(params: { path: string; offset?: number; limit?: number; symbol?: string; map?: boolean }) {
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  readModule.registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("buildReadOutput", () => {
  beforeAll(async () => {
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds plain read text and ptcValue from the same selected lines", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const selectedLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n");
    const built = readOutputModule.buildReadOutput({
      path: filePath,
      startLine: 1,
      endLine: selectedLines.length,
      totalLines: selectedLines.length,
      selectedLines,
    });

    expect(built.text).toBe(
      selectedLines
        .map((rawLine, index) => {
          const line = index + 1;
          const hash = computeLineHash(line, rawLine);
          return `${line}:${hash}|${escapeControlCharsForDisplay(rawLine)}`;
        })
        .join("\n"),
    );

    expect(built.ptcValue).toEqual({
      tool: "read",
      path: filePath,
      range: {
        startLine: 1,
        endLine: selectedLines.length,
        totalLines: selectedLines.length,
      },
      warnings: [],
      truncation: null,
      symbol: null,
      map: {
        requested: false,
        appended: false,
      },
      lines: selectedLines.map((rawLine, index) => {
        const line = index + 1;
        const hash = computeLineHash(line, rawLine);
        return {
          line,
          hash,
          anchor: `${line}:${hash}`,
          raw: rawLine,
          display: escapeControlCharsForDisplay(rawLine),
        };
      }),
    });
  });

  it("routes plain read results through buildReadOutput", async () => {
    const spy = vi.spyOn(readOutputModule, "buildReadOutput");
    const filePath = resolve(fixturesDir, "small.ts");
    const selectedLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n");
    const result = await callReadTool({ path: filePath });

    expect(spy).toHaveBeenCalled();
    const built = spy.mock.results.at(-1)?.value;
    expect(spy.mock.calls.at(-1)?.[0]).toEqual({
      path: filePath,
      startLine: 1,
      endLine: selectedLines.length,
      totalLines: selectedLines.length,
      selectedLines,
      warnings: [],
      truncation: null,
      continuation: null,
      symbol: null,
      map: {
        requested: false,
        appended: false,
        text: null,
      },
      rehydrate: {
        tool: "read",
        input: { path: filePath },
      },
    });
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });
});

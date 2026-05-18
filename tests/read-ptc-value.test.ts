import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callReadTool(params: { path: string; offset?: number; limit?: number; symbol?: string; map?: boolean }) {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("read ptcValue — basic line payload", () => {
  beforeAll(async () => {
  });

  it("returns a structured payload with exact line metadata while keeping text output unchanged", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const raw = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
    const sourceLines = raw.split("\n");
    const result = await callReadTool({ path: filePath });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;

    expect(ptc).toBeDefined();
    expect(ptc).toEqual({
      tool: "read",
      path: filePath,
      range: {
        startLine: 1,
        endLine: sourceLines.length,
        totalLines: sourceLines.length,
      },
      warnings: [],
      truncation: null,
      symbol: null,
      map: {
        requested: false,
        appended: false,
      },
      lines: sourceLines.map((rawLine, index) => {
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

    const expectedText = sourceLines
      .map((rawLine, index) => {
        const line = index + 1;
        const hash = computeLineHash(line, rawLine);
        return `${line}:${hash}|${escapeControlCharsForDisplay(rawLine)}`;
      })
      .join("\n");

    expect(text).toBe(expectedText);
  });
});

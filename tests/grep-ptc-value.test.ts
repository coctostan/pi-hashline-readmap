import { describe, it, expect, beforeAll } from "vitest";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function callGrepTool(params: { pattern: string; path: string; literal?: boolean; context?: number; summary?: boolean; limit?: number }) {
  const { registerGrepTool } = await import("../src/grep.js");
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerGrepTool(mockPi as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function makeManyMatchesFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-grep-ptc-"));
  const filePath = resolve(dir, "many-matches.txt");
  writeFileSync(filePath, Array.from({ length: 60 }, (_, index) => `match line ${index + 1}`).join("\n"), "utf-8");
  return filePath;
}

function makeBinaryFile(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-grep-ptc-bin-"));
  const filePath = resolve(dir, "sample.bin");
  writeFileSync(filePath, Buffer.from([0x00, 0x61, 0x62, 0x63]));
  return filePath;
}

describe("grep ptcValue", () => {
  beforeAll(async () => {
  });

  it("returns structured match and context records with complete fields while keeping rendered grep text unchanged", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const displayPath = basename(filePath);
    const sourceLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n");
    const result = await callGrepTool({ pattern: "createDemoDirectory", path: filePath, literal: true, context: 1 });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.tool).toBe("grep");
    expect(ptc.summary).toBe(false);
    expect(ptc.totalMatches).toBe(1);
    expect(Object.keys(ptc.records[0]).sort()).toEqual(["anchor", "kind", "line", "path"]);
    expect(ptc.records).toEqual([
      { lineNumber: 44, kind: "context" as const },
      { lineNumber: 45, kind: "match" as const },
      { lineNumber: 46, kind: "context" as const },
    ].map(({ lineNumber, kind }) => {
      const raw = sourceLines[lineNumber - 1];
      const hash = computeLineHash(lineNumber, raw);
      return {
        path: filePath,
        line: lineNumber,
        anchor: `${lineNumber}:${hash}`,
        kind,
      };
    }));
    const expectedText = [
      "[1 matches in 1 files]",
      `--- ${displayPath} (1 matches) ---`,
      ...[
        { lineNumber: 44, marker: "  " },
        { lineNumber: 45, marker: ">>" },
        { lineNumber: 46, marker: "  " },
      ].map(({ lineNumber, marker }) => {
        const raw = sourceLines[lineNumber - 1];
        const hash = computeLineHash(lineNumber, raw);
        return `${displayPath}:${marker}${lineNumber}:${hash}|${escapeControlCharsForDisplay(raw)}`;
      }),
    ].join("\n");
    expect(text).toBe(expectedText);
  });
  it("keeps ptc records aligned with the truncated rendered output", async () => {
    const filePath = makeManyMatchesFile();
    const result = await callGrepTool({ pattern: "match", path: filePath, literal: true });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;
    expect(text).toContain(`--- ${basename(filePath)} (60 matches) ---`);
    expect(ptc.totalMatches).toBe(60);
    expect(ptc.records).toHaveLength(10);
    expect(text.split("\n").filter((line) => line.startsWith(`${basename(filePath)}:`))).toHaveLength(10);
  });
  it("returns a minimal ptc payload for direct binary-file warnings", async () => {
    const filePath = makeBinaryFile();
    const result = await callGrepTool({ pattern: "abc", path: filePath, literal: true });
    const text = getTextContent(result);
    const ptc = result.details?.ptcValue;
    expect(text).toContain("appears to be a binary file");
    expect(ptc).toEqual({
      tool: "grep",
      summary: false,
      totalMatches: 0,
      records: [],
    });
  });
});

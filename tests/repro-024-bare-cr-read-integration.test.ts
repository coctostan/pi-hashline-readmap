import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type ReadParams = { path: string; offset?: number; limit?: number };

async function callReadTool(params: ReadParams) {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = {
    registerTool(def: any) {
      capturedTool = def;
    },
  };
  registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("Bug #024: bare CR warning in read output", () => {
  const tmpDir = join(__dirname, ".tmp-024");
  const bareCRFile = join(tmpDir, "bareCR.txt");
  const normalFile = join(tmpDir, "normal.txt");
  const mixedFile = join(tmpDir, "mixed.txt");

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
    // Pure bare-CR file (classic Mac)
    writeFileSync(bareCRFile, Buffer.from("Line 1\rLine 2\rLine 3\r"));
    // Normal LF file
    writeFileSync(normalFile, "Line 1\nLine 2\nLine 3\n");
    // Mixed: LF + bare CR
    writeFileSync(mixedFile, Buffer.from("Line 1\nLine 2\rLine 3\n"));
  });

  afterAll(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {}
  });

  it("read output for bare-CR file starts with bare-CR warning", async () => {
    const result = await callReadTool({ path: bareCRFile });
    const text = getTextContent(result);
    expect(text).toContain("[Warning: file contains bare CR");
    expect(text).toContain("line numbering may be inconsistent");
  });

  it("read output for normal LF file does NOT contain bare-CR warning", async () => {
    const result = await callReadTool({ path: normalFile });
    const text = getTextContent(result);
    expect(text).not.toContain("bare CR");
  });

  it("read output for mixed LF+bare-CR file includes bare-CR warning", async () => {
    const result = await callReadTool({ path: mixedFile });
    const text = getTextContent(result);
    expect(text).toContain("[Warning: file contains bare CR");
  });
});

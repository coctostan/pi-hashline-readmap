import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

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

function makeBareCrFixture(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-ptc-"));
  const filePath = resolve(dir, "bare-cr.txt");
  writeFileSync(filePath, "alpha\rbeta\rgamma", "utf-8");
  return filePath;
}

describe("read ptcValue — metadata cases", () => {
  it("captures truncation and auto-appended map metadata for large reads", async () => {
    const filePath = resolve(fixturesDir, "large.ts");
    const result = await callReadTool({ path: filePath });
    const ptc = result.details?.ptcValue;
    const text = getTextContent(result);

    expect(ptc).toBeDefined();
    expect(ptc.truncation).not.toBeNull();
    expect(ptc.map).toEqual({ requested: false, appended: true });
    expect(text).toContain("[Output truncated:");
    expect(text).toContain("File Map:");
  });

  it("captures symbol metadata for symbol reads", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({ path: filePath, symbol: "createDemoDirectory" });
    const ptc = result.details?.ptcValue;
    const text = getTextContent(result);

    expect(ptc.symbol).toEqual({
      query: "createDemoDirectory",
      name: "createDemoDirectory",
      kind: "function",
      parentName: undefined,
      startLine: 45,
      endLine: 49,
      tier: "exact",
    });
    expect(ptc.range).toEqual({ startLine: 45, endLine: 49, totalLines: 49 });
    expect(text.startsWith("[Symbol: createDemoDirectory (function), lines 45-49 of 49]")).toBe(true);
  });

  it("captures explicit map requests on small files", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({ path: filePath, map: true });
    const ptc = result.details?.ptcValue;
    const text = getTextContent(result);

    expect(ptc.map).toEqual({ requested: true, appended: true });
    expect(text).toContain("File Map:");
  });

  it("captures bare-CR warnings as structured warnings without changing warning text", async () => {
    const filePath = makeBareCrFixture();
    const result = await callReadTool({ path: filePath });
    const ptc = result.details?.ptcValue;
    const text = getTextContent(result);

    expect(ptc.warnings).toContainEqual({
      code: "bare-cr",
      message: "[Warning: file contains bare CR (\\r) line endings — line numbering may be inconsistent with grep and other tools]",
    });
    expect(text.startsWith("[Warning: file contains bare CR (\\r) line endings — line numbering may be inconsistent with grep and other tools]")).toBe(true);
  });
});

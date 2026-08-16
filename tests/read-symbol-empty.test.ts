import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerReadTool } from "../src/read.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

function captureReadTool() {
  let captured: any;
  registerReadTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

function textOf(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("read symbol validation", () => {
  it.each([
    ["empty string", ""],
    ["spaces only", "   "],
    ["tab only", "\t"],
    ["newline only", "\n"],
  ])("treats %s symbol as an omitted placeholder with an explicit notice", async (_label, symbol) => {
    const result = await captureReadTool().execute(
      "read-empty-symbol",
      { path: resolve(fixturesDir, "small.ts"), symbol },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("[Read params adjusted: ignored empty symbol]");
    expect(result.details.ptcValue.range).toMatchObject({
      startLine: 1,
      endLine: result.details.ptcValue.range.totalLines,
    });
    expect(result.details.ptcValue.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
    );
  });

  it("regression: omitted symbol still returns full file output", async () => {
    const tool = captureReadTool();
    const result = await tool.execute(
      "read-no-symbol",
      { path: resolve(fixturesDir, "small.ts") },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^1:[0-9a-f]{3}\|/m);
  });

  it("trims and resolves a surviving non-empty symbol", async () => {
    const result = await captureReadTool().execute(
      "read-real-symbol",
      { path: resolve(fixturesDir, "small.ts"), symbol: "  createDemoDirectory  " },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(result.details.ptcValue.symbol).toMatchObject({
      query: "createDemoDirectory",
      name: "createDemoDirectory",
    });
    expect(result.details.ptcValue.range).toMatchObject({ startLine: 45, endLine: 49 });
    expect(textOf(result)).toMatch(/^45:[0-9a-f]{3}\|export function createDemoDirectory/m);
    expect(textOf(result)).not.toContain("ignored empty symbol");
  });
});

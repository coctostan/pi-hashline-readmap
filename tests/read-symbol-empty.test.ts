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
  ])("treats %s symbol as an omitted placeholder with an explicit notice", async (_label, sym) => {
    const tool = captureReadTool();
    const result = await tool.execute(
      "read-empty",
      { path: resolve(fixturesDir, "small.ts"), symbol: sym },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("[Read params adjusted: ignored empty symbol]");
    expect(textOf(result)).toMatch(/^1:[0-9a-f]{3}\|/m);
    expect(result.details?.ptcValue?.warnings).toEqual(
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

  it("regression: whitespace-trimmed real symbol resolves via the lookup path (not the validator)", async () => {
    const tool = captureReadTool();
    const result = await tool.execute(
      "read-real-symbol",
      { path: resolve(fixturesDir, "small.ts"), symbol: "  createDemoDirectory  " },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    expect(textOf(result)).not.toContain("Invalid symbol: expected a non-empty string.");
  });
});

import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerReadTool } from "../src/read.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

function captureReadTool() {
  let capturedTool: any;
  registerReadTool(
    {
      registerTool(def: any) {
        capturedTool = def;
      },
    } as any,
  );
  return capturedTool;
}

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

describe("issue #081 regression — invalid offset", () => {
  it("continues to reject negative offsets", async () => {
    const tool = captureReadTool();
    const filePath = resolve(fixturesDir, "small.ts");

    const negativeOffset = await tool.execute(
      "read-081-negative-offset",
      { path: filePath, offset: -5 },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(negativeOffset.isError).toBe(true);
    expect(getTextContent(negativeOffset)).toBe("Invalid offset: expected a positive integer, received -5.");
    expect(negativeOffset.details?.ptcValue).toEqual({
      tool: "read",
      ok: false,
      path: filePath,
      error: {
        code: "invalid-offset",
        message: "Invalid offset: expected a positive integer, received -5.",
      },
    });
  });

  it.each([0, "0"])("reports and omits a %s offset placeholder", async (value) => {
    const tool = captureReadTool();
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await tool.execute(
      "read-081-zero-offset",
      { path: filePath, offset: value },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(getTextContent(result)).toContain("[Read params adjusted: ignored offset 0]");
    expect(getTextContent(result)).toMatch(/^1:[0-9a-f]{3}\|/m);
    expect(result.details?.ptcValue?.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
    );
  });
});

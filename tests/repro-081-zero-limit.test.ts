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

describe("issue #081 regression — zero limit", () => {
  it.each([0, "0"])("reports and omits a %s limit placeholder", async (value) => {
    const tool = captureReadTool();
    const filePath = resolve(fixturesDir, "small.ts");

    const result = await tool.execute(
      "read-081-zero-limit",
      { path: filePath, limit: value },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(getTextContent(result)).toContain("[Read params adjusted: ignored limit 0]");
    expect(getTextContent(result)).toMatch(/^1:[0-9a-f]{3}\|/m);
    expect(result.details?.ptcValue?.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
    );
  });
});

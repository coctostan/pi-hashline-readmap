import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerReadTool } from "../src/read.js";

const fixture = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/small.ts");

function tool(): any {
  let captured: any;
  registerReadTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

function textOf(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

describe("issue #081 regression — zero offset", () => {
  it.each([0, "0"])("omits and reports offset %s", async (offset) => {
    const result = await tool().execute(
      "read-zero-offset",
      { path: fixture, offset },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain("[Read params adjusted: ignored offset 0]");
    expect(result.details.ptcValue.range).toMatchObject({
      startLine: 1,
      endLine: result.details.ptcValue.range.totalLines,
    });
    expect(result.details.ptcValue.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
    );
  });
});

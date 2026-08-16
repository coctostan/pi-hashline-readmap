import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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

describe("read empty numeric placeholders", () => {
  it.each([
    ["offset", { offset: "" }, "ignored empty offset"],
    ["limit", { limit: "" }, "ignored empty limit"],
  ] as const)("omits and reports an empty %s", async (_name, params, adjustment) => {
    const result = await tool().execute(
      "read-empty-numeric",
      { path: fixture, ...params },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain(`[Read params adjusted: ${adjustment}]`);
    expect(result.details.ptcValue.range).toMatchObject({
      startLine: 1,
      endLine: result.details.ptcValue.range.totalLines,
    });
    expect(result.details.ptcValue.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
    );
  });
});

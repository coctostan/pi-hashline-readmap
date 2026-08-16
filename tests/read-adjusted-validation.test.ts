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

const cases = [
  { name: "offset coercion", params: { path: fixture, offset: "bad", limit: "" }, adjustment: "ignored empty limit", code: "invalid-offset" },
  { name: "limit coercion", params: { path: fixture, offset: "", limit: "bad" }, adjustment: "ignored empty offset", code: "invalid-limit" },
  { name: "negative limit", params: { path: fixture, offset: "", limit: -1 }, adjustment: "ignored empty offset", code: "invalid-limit" },
  { name: "negative offset", params: { path: fixture, offset: -1, limit: "" }, adjustment: "ignored empty limit", code: "invalid-offset" },
  { name: "invalid symbol type", params: { path: fixture, symbol: 42, limit: "" }, adjustment: "ignored empty limit", code: "invalid-params-combo" },
  { name: "symbol-offset conflict", params: { path: fixture, symbol: "createDemoDirectory", offset: 1, limit: 0 }, adjustment: "ignored limit 0", code: "invalid-params-combo" },
  { name: "bundle without surviving symbol", params: { path: fixture, symbol: "", bundle: "local" }, adjustment: "ignored empty symbol", code: "invalid-params-combo" },
] as const;

describe("read adjusted validation failures", () => {
  it.each(cases)("retains adjustment and error for $name", async ({ params, adjustment, code }) => {
    const result = await tool().execute(
      "read-adjusted-validation",
      params,
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe(code);
    expect(textOf(result)).toContain(`[Read params adjusted: ${adjustment}]`);
    expect(textOf(result)).toContain(result.details.ptcValue.error.message);
    expect(result.details.ptcValue.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
    );
  });
});

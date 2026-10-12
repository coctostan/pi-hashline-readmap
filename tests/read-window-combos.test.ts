import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

async function callRead(params: Record<string, unknown>): Promise<any> {
  let tool: any;
  registerReadTool({ registerTool(def: any) { tool = def; } } as any);
  return tool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const textOf = (result: any): string => result.content.find((c: any) => c.type === "text")?.text ?? "";
function fixture(content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-combo-"));
  const path = resolve(dir, "f.ts");
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("read window params — invalid combinations", () => {
  it.each([
    ["no offset", { charOffset: 0 }, /offset/],
    ["offset 0 (omitted placeholder)", { offset: 0, charOffset: 0 }, /offset/],
    ["limit 2", { offset: 1, limit: 2, charOffset: 0 }, /limit/],
    ["map", { offset: 1, charOffset: 0, map: true }, /map/],
    ["symbol", { offset: 1, charOffset: 0, symbol: "a" }, /symbol/],
    ["bundle", { offset: 1, charOffset: 0, bundle: "local" }, /bundle|symbol/],
    ["strictSymbol", { offset: 1, charOffset: 0, strictSymbol: true }, /strictSymbol|symbol/],
    ["charLimit alone without offset", { charLimit: 100 }, /offset/],
  ])("rejects %s with invalid-params-combo", async (_name, extra, pattern) => {
    const path = fixture("const a = 1;\nconst b = 2;\n");
    const result = await callRead({ path, ...extra });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(pattern);
    expect(result.details.ptcValue).toMatchObject({ tool: "read", ok: false, error: { code: "invalid-params-combo" } });
  });

  it("allows limit: 1 with a window", async () => {
    const path = fixture("const a = 1;\nconst b = 2;\n");
    const result = await callRead({ path, offset: 1, limit: 1, charOffset: 0 });
    expect(result.isError).not.toBe(true);
  });
});

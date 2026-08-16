import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { PTC_ERROR_CODES } from "../src/ptc-error-codes.js";

async function callReadTool(params: Record<string, unknown>) {
  const { registerReadTool } = await import("../src/read.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerReadTool(mockPi as any);
  if (!captured) throw new Error("read tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getPtc(result: any) { return result.details?.ptcValue; }

describe("read ptcValue.error — remaining error sites", () => {
  it("invalid-limit when limit is negative", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-r-il-"));
    const f = resolve(dir, "f.txt"); writeFileSync(f, "a\n", "utf-8");
    const r = await callReadTool({ path: f, limit: -1 });
    expect(getPtc(r)?.error?.code).toBe("invalid-limit");
  });

  it("retains actionable invalid-params-combo errors only for symbol plus offset and bundle without symbol", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-r-invalid-combos-"));
    const filePath = resolve(dir, "f.ts");
    writeFileSync(
      filePath,
      ["function helper() { return 1; }", "function foo() { return helper(); }", ""].join("\n"),
      "utf-8",
    );

    const offsetVariants = [
      { path: filePath, symbol: "foo", offset: 1 },
      { path: filePath, symbol: "foo", offset: 1, limit: 2 },
      { path: filePath, symbol: "foo", offset: 1, map: true },
      { path: filePath, symbol: "foo", offset: 1, limit: 2, map: true, bundle: "local" },
    ];

    for (const params of offsetVariants) {
      const result = await callReadTool(params);
      const message = result.content[0].text;
      expect(result.isError).toBe(true);
      expect(getPtc(result)?.error?.code).toBe("invalid-params-combo");
      expect(message).toContain("omit offset and use limit");
      expect(message).toContain("symbol@line");
    }

    const withoutSymbol = await callReadTool({ path: filePath, bundle: "local" });
    expect(withoutSymbol.isError).toBe(true);
    expect(getPtc(withoutSymbol)?.error?.code).toBe("invalid-params-combo");
    expect(withoutSymbol.content[0].text).toContain("Cannot use bundle without symbol");

    expect(PTC_ERROR_CODES["invalid-params-combo"].trigger).toBe(
      "e.g. symbol + offset, bundle without symbol, invalid scoped or numeric parameter combinations",
    );
    expect(PTC_ERROR_CODES["invalid-params-combo"].trigger).not.toContain("bundle + map");
    expect(PTC_ERROR_CODES["invalid-params-combo"].trigger).not.toContain("map + symbol");
  });



  it("path-is-directory when path is a directory", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-r-dir-"));
    const sub = resolve(dir, "sub"); mkdirSync(sub);
    const r = await callReadTool({ path: sub });
    expect(getPtc(r)?.error?.code).toBe("path-is-directory");
  });

  it("file-not-found when file is missing", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-r-nf-"));
    const r = await callReadTool({ path: resolve(dir, "missing.txt") });
    expect(getPtc(r)?.error?.code).toBe("file-not-found");
  });

  it("offset-past-end when offset > total lines", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-r-pe-"));
    const f = resolve(dir, "f.txt"); writeFileSync(f, "one\ntwo\n", "utf-8");
    const r = await callReadTool({ path: f, offset: 999 });
    expect(getPtc(r)?.error?.code).toBe("offset-past-end");
  });
});

import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensureHashInit, computeLineHash } from "../src/hashline.js";

async function callEdit(params: Record<string, unknown>, options: any = {}) {
  const { registerEditTool } = await import("../src/edit.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerEditTool(mockPi as any, options);
  if (!captured) throw new Error("edit tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const getPtc = (r: any) => r.details?.ptcValue;

describe("edit ptcValue.error — validation", () => {
  beforeAll(async () => { await ensureHashInit(); });

  it("file-not-read when wasReadInSession returns false", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-fnr-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const lines = readFileSync(f, "utf-8").split("\n");
    const anchor = `1:${computeLineHash(1, lines[0])}`;
    const r = await callEdit(
      { path: f, edits: [{ set_line: { anchor, new_text: "const a = 2;" } }] },
      { wasReadInSession: () => false },
    );
    expect(r.isError).toBe(true);
    expect(getPtc(r)?.tool).toBe("edit");
    expect(getPtc(r)?.ok).toBe(false);
    expect(getPtc(r)?.path).toBe(f);
    expect(getPtc(r)?.error?.code).toBe("file-not-read");
    expect(getPtc(r)?.error?.hint).toBeDefined();
    expect(typeof getPtc(r)?.error?.hint).toBe("string");
    expect(getPtc(r)?.error?.hint!.length).toBeGreaterThan(0);
  });

  it("invalid-edit-variant when edits array is empty", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-iev-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit(
      { path: f, edits: [] },
      { wasReadInSession: () => true },
    );
    expect(getPtc(r)?.error?.code).toBe("invalid-edit-variant");
  });

  it("coerces JSON-stringified edits array (#208)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-208-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const lines = readFileSync(f, "utf-8").split("\n");
    const anchor = `1:${computeLineHash(1, lines[0])}`;
    const editsArr = [{ set_line: { anchor, new_text: "const a = 2;" } }];
    const r = await callEdit(
      { path: f, edits: JSON.stringify(editsArr) },
      { wasReadInSession: () => true },
    );
    expect(r.isError).toBeFalsy();
    expect(readFileSync(f, "utf-8")).toBe("const a = 2;\n");
  });

  it("non-array/invalid edits string still yields clear validation error (#208)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-208b-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit(
      { path: f, edits: '{"not":"an array"}' },
      { wasReadInSession: () => true },
    );
    expect(r.isError).toBe(true);
    expect(getPtc(r)?.error?.code).toBe("invalid-edit-variant");
  });
});

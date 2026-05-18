import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

async function callEdit(params: Record<string, unknown>) {
  const { registerEditTool } = await import("../src/edit.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerEditTool(mockPi as any, { wasReadInSession: () => true });
  if (!captured) throw new Error("edit tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const getPtc = (r: any) => r.details?.ptcValue;

describe("edit ptcValue.error — fs read errors", () => {

  it("path-is-directory when target is a directory", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-pd-"));
    const sub = resolve(dir, "sub"); mkdirSync(sub);
    const r = await callEdit({
      path: sub,
      edits: [{ set_line: { anchor: "1:00", new_text: "x" } }],
    });
    expect(r.isError).toBe(true);
    expect(getPtc(r)?.error?.code).toBe("path-is-directory");
  });

  it("file-not-found when target missing", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-fnf-"));
    const r = await callEdit({
      path: resolve(dir, "missing.ts"),
      edits: [{ set_line: { anchor: "1:00", new_text: "x" } }],
    });
    expect(getPtc(r)?.error?.code).toBe("file-not-found");
  });
});

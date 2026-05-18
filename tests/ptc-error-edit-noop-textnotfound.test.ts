import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";

async function callEdit(params: Record<string, unknown>) {
  const { registerEditTool } = await import("../src/edit.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerEditTool(mockPi as any, { wasReadInSession: () => true });
  if (!captured) throw new Error("edit tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const getPtc = (r: any) => r.details?.ptcValue;

describe("edit ptcValue.error — text-not-found and no-op", () => {

  it("text-not-found when replace.old_text missing", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-tnf-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit({
      path: f,
      edits: [{ replace: { old_text: "DOES_NOT_EXIST", new_text: "x" } }],
    });
    expect(r.isError).toBe(true);
    expect(getPtc(r)?.error?.code).toBe("text-not-found");
    const text = r.content.find((c: any) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/Could not find exact text to replace/);
  });

  it("no-op when edits produce identical content", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-noop-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const lines = readFileSync(f, "utf-8").split("\n");
    const anchor = `1:${computeLineHash(1, lines[0])}`;
    const r = await callEdit({
      path: f,
      edits: [{ set_line: { anchor, new_text: lines[0] } }],
    });
    expect(r.isError).toBe(true);
    expect(getPtc(r)?.error?.code).toBe("no-op");
    const text = r.content.find((c: any) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/No changes made/);
  });
});

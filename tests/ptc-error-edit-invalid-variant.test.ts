import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
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

describe("edit ptcValue.error — invalid-edit-variant", () => {

  it("invalid-edit-variant when edits[i] has top-level old_text/new_text", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-tlv-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit({
      path: f,
      edits: [{ old_text: "a", new_text: "b" }],
    });
    expect(r.isError).toBe(true);
    expect(getPtc(r)?.error?.code).toBe("invalid-edit-variant");
  });

  it("invalid-edit-variant when edits[i] contains diff", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-diff-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit({
      path: f,
      edits: [{ diff: "@@ -1 +1 @@\n-x\n+y\n" }],
    });
    expect(getPtc(r)?.error?.code).toBe("invalid-edit-variant");
  });

  it("invalid-edit-variant when edits[i] has zero variant keys", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-zero-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit({
      path: f,
      edits: [{}],
    });
    expect(getPtc(r)?.error?.code).toBe("invalid-edit-variant");
  });

  it("invalid-edit-variant when legacy input partial (only oldText)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-leg-"));
    const f = resolve(dir, "f.ts"); writeFileSync(f, "const a = 1;\n", "utf-8");
    const r = await callEdit({ path: f, oldText: "a" });
    expect(getPtc(r)?.error?.code).toBe("invalid-edit-variant");
  });
});

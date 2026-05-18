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

describe("edit ptcValue.error — binary-file", () => {

  it("returns binary-file when target is binary", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-bin-"));
    const f = resolve(dir, "b.bin");
    writeFileSync(f, Buffer.from([0x48, 0x00, 0x6c]));
    const r = await callEdit({
      path: f,
      edits: [{ set_line: { anchor: "1:00", new_text: "x" } }],
    });
    expect(r.isError).toBe(true);
    const text = r.content.find((c: any) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/Cannot edit binary file/);
    const ptc = r.details?.ptcValue;
    expect(ptc?.tool).toBe("edit");
    expect(ptc?.error?.code).toBe("binary-file");
  });
});

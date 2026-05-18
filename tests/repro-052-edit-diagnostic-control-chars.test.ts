import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

async function callEditTool(params: { path: string; edits: any[] }) {
  const { registerEditTool } = await import("../src/edit.js");
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerEditTool(mockPi as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

describe("Bug #052: edit no-op diagnostics escape control characters", () => {
  beforeAll(async () => {
  });

  it("no-op diagnostic previews render escaped control bytes", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-052-edit-"));
    const filePath = resolve(dir, "control.txt");
    writeFileSync(filePath, "alpha\nline with \x07 bell\nomega\n", "utf-8");

    const { computeLineHash } = await import("../src/hashline.js");
    const anchor = `2:${computeLineHash(2, "line with \x07 bell")}`;

    const result = await callEditTool({
      path: filePath,
      edits: [{ set_line: { anchor, new_text: "line with \x07 bell" } }],
    });

    expect(result.isError).toBe(true);
    const text = result.content.find((c: any) => c.type === "text")?.text ?? "";
    expect(text).toContain("No changes made");
    expect(text).toContain("\\u0007");
    expect(CONTROL_CHAR_RE.test(text)).toBe(false);
  });
});

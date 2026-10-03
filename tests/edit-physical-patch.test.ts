import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { applyPatch } from "diff";
import { registerEditTool } from "../src/edit.js";
import { ensureHashInit } from "../src/hashline.js";
beforeAll(async () => { await ensureHashInit(); });
it("emits a patch that recreates the persisted physical candidate", async () => {
  for (const bom of ["", "\uFEFF"]) for (const final of ["", "\r\n"]) {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-patch-261-"));
    try {
      const path = resolve(cwd, "sample.txt");
      const original = bom + "a\nb" + final;
      const expected = bom + "a\r\nb" + final;
      writeFileSync(path, original);
      const tool = registerEditTool({ registerTool() {} } as any);
      const result: any = await tool.execute("261-patch", { path, edits: [{ replace: { old_text: "a\nb", new_text: "a\r\nb" } }], postEditVerify: true }, undefined, undefined, { cwd } as any);
      let patched: string | false = false;
      if (typeof result.details?.patch === "string") patched = applyPatch(original, result.details.patch, { autoConvertLineEndings: false });
      expect(result.isError === undefined && patched === expected && readFileSync(path).equals(Buffer.from(expected))).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});

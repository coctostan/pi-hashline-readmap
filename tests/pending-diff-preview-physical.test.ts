import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";
beforeAll(async () => { await ensureHashInit(); });
it("projects the same physical candidate as execution without writing", async () => {
  const fixtures = [
    { original: "\uFEFFhead\nold\r\nline\n", edits: [{ replace: { old_text: "old\r\nline", new_text: "new\r\nline" } }], expected: "\uFEFFhead\nnew\r\nline\n" },
    { original: "alpha\nbeta\r\ngamma", edits: [{ set_line: { anchor: `1:${computeLineHash(1, "alpha")}`, new_text: "ALPHA" } }], expected: "ALPHA\nbeta\r\ngamma" },
    { original: "// keep\nexport function work() {\r\n  return 1;\n}\r\n//tail\n", edits: [{ replace_symbol: { symbol: "work", new_body: "export function work() {\n  return 2;\n}" } }], expected: "// keep\nexport function work() {\r\n  return 2;\r\n}\r\n//tail\n" },
  ];
  for (const fixture of fixtures) {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-preview-261-"));
    try {
      const path = resolve(cwd, "sample.ts");
      writeFileSync(path, fixture.original);
      const preview = await buildPendingEditPreviewData({ path, edits: fixture.edits }, cwd);
      expect(preview.type === "ok" && preview.data.nextContent === fixture.expected && readFileSync(path).equals(Buffer.from(fixture.original))).toBe(true);
      const tool = registerEditTool({ registerTool() {} } as any, { wasReadInSession: () => true });
      const result: any = await tool.execute("261-preview", { path, edits: fixture.edits, postEditVerify: true }, undefined, undefined, { cwd } as any);
      expect(result.isError === undefined && readFileSync(path).equals(Buffer.from(fixture.expected))).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
  const cwd = mkdtempSync(resolve(tmpdir(), "pi-preview-mixed-261-"));
  try {
    const path = resolve(cwd, "sample.ts");
    writeFileSync(path, "alpha\nbeta\r\n");
    const preview = await buildPendingEditPreviewData({ path, edits: [{ set_line: { anchor: `1:${computeLineHash(1, "alpha")}`, new_text: "ALPHA" } }, { replace: { old_text: "beta", new_text: "BETA" } }] }, cwd);
    expect(preview).toEqual({ type: "skip", reason: "mixed edit families require execution" });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

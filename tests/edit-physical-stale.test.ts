import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { ServedLines } from "../src/served-lines.js";
beforeAll(async () => { await ensureHashInit(); });
it("retains no-write safety for physical-only edits and anchored refusals", async () => {
  const ref = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;
  const fixtures = [
    { edits: [{ replace: { old_text: "changed\nline", new_text: "changed\r\nline" } }], code: "hash-mismatch" },
    { edits: [{ set_line: { anchor: ref(1, "old"), new_text: "NEW" } }], code: "hash-mismatch" },
    { edits: [{ replace_lines: { start_anchor: ref(1, "changed"), end_anchor: ref(2, "line"), new_text: "WHOLE" } }, { set_line: { anchor: ref(1, "changed"), new_text: "ONE" } }], code: "overlapping-edit" },
    { edits: [{ replace: { old_text: "changed\nline", new_text: "changed\nline" } }], code: undefined },
  ];
  for (const fixture of fixtures) {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-stale-261-"));
    try {
      const path = resolve(cwd, "sample.txt");
      const original = "changed\nline\r\n";
      writeFileSync(path, original);
      const served = new ServedLines();
      served.record(path, [{ line: 1, hash: computeLineHash(1, "old") }]);
      const tool = registerEditTool({ registerTool() {} } as any, { served, wasReadInSession: () => true });
      const result: any = await tool.execute("261-stale", { path, edits: fixture.edits, postEditVerify: true }, undefined, undefined, { cwd } as any);
      expect(result.details?.ptcValue?.error?.code === fixture.code && readFileSync(path).equals(Buffer.from(original))).toBe(true);
      if (fixture.code) expect(result.isError).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});

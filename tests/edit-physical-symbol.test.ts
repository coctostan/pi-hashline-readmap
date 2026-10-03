import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => { await ensureHashInit(); });
it("preserves physical boundaries outside resolved symbol ranges", async () => {
  for (const finalEnding of ["", "\n"]) for (const combined of [false, true]) {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-symbol-261-"));
    try {
      const path = resolve(cwd, "sample.ts");
      const original = "\uFEFF// keep café\nexport function work() {\r\n  return 1;\n}\r\n//tail" + finalEnding;
      writeFileSync(path, original);
      const edits: any[] = [{ replace_symbol: { symbol: "work", new_body: "export function work() {\r\n  return 2;\r\n}" } }];
      if (combined) {
        edits.push({ set_line: { anchor: `5:${computeLineHash(5, "//tail")}`, new_text: "//TAIL" } });
        edits.push({ replace: { old_text: "return 2", new_text: "return 3" } });
      }
      const tool = registerEditTool({ registerTool() {} } as any, { wasReadInSession: () => true });
      const result: any = await tool.execute("261-symbol", { path, edits, postEditVerify: true }, undefined, undefined, { cwd } as any);
      expect(result.isError).toBeUndefined();
      const expected = `\uFEFF// keep café\nexport function work() {\r\n  return ${combined ? 3 : 2};\r\n}\r\n${combined ? "//TAIL" : "//tail"}` + finalEnding;
      expect(readFileSync(path).equals(Buffer.from(expected))).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});

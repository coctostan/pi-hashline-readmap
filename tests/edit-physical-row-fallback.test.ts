import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
beforeAll(async () => { await ensureHashInit(); });
it("projects verified pasted row blocks without flattening separators", async () => {
  for (const repeated of [false, true]) for (const all of [false, true]) {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-row-261-"));
    try {
      const path = resolve(cwd, "sample.txt");
      const original = "head\nold\r\nline\nlast\r\n" + (repeated ? "old\nline\r\n" : "");
      writeFileSync(path, original);
      const old_text = `2:${computeLineHash(2, "old")}|old\n3:${computeLineHash(3, "line")}|line`;
      const tool = registerEditTool({ registerTool() {} } as any);
      const result: any = await tool.execute("261-row", { path, edits: [{ replace: { old_text, new_text: "NEW\nLINE", all } }], postEditVerify: true }, undefined, undefined, { cwd } as any);
      const refused = repeated && !all;
      const expected = refused ? original : "head\nNEW\r\nLINE\nlast\r\n" + (repeated ? "NEW\nLINE\r\n" : "");
      expect(readFileSync(path).equals(Buffer.from(expected)) && (refused ? result.details?.ptcValue?.error?.code === "text-not-found" : result.isError === undefined)).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});

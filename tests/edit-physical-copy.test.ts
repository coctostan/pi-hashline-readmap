import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => { await ensureHashInit(); });
it("preserves original source separators for copy and move", async () => {
  const ref = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;
  for (const crossFile of [true, false]) for (const move of [false, true]) {
    const cwd = mkdtempSync(resolve(tmpdir(), "pi-copy-261-"));
    try {
      const source = resolve(cwd, "source.txt");
      const target = crossFile ? resolve(cwd, "target.txt") : source;
      const original = "\uFEFFhead\none\r\ntwo\nfoot\r\n";
      writeFileSync(source, original);
      if (crossFile) writeFileSync(target, "target\nlast\r\n");
      const payload = { from_path: crossFile ? source : undefined, start_anchor: ref(2, "one"), end_anchor: ref(3, "two"), after_anchor: crossFile ? ref(1, "target") : move ? ref(4, "foot") : ref(1, "head") };
      const edits = move ? [{ move_lines: payload }] : [{ copy_lines: payload }];
      const tool = registerEditTool({ registerTool() {} } as any, { wasReadInSession: () => true });
      const result: any = await tool.execute("261-copy", { path: target, edits, postEditVerify: true }, undefined, undefined, { cwd } as any);
      expect(result.isError).toBeUndefined();
      const expectedTarget = crossFile ? "target\none\r\ntwo\nlast\r\n"
        : move ? "\uFEFFhead\nfoot\r\none\r\ntwo\r\n"
        : "\uFEFFhead\none\r\ntwo\none\r\ntwo\nfoot\r\n";
      const expectedSource = move ? "\uFEFFhead\nfoot\r\n" : original;
      expect(readFileSync(target).equals(Buffer.from(expectedTarget)) && (!crossFile || readFileSync(source).equals(Buffer.from(expectedSource)))).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});

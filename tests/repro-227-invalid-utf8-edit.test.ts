import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function captureEditTool() {
  let tool: any;
  registerEditTool(
    { registerTool(def: any) { tool = def; } } as any,
    { wasReadInSession: () => true, syntaxValidate: "off" },
  );
  if (!tool) throw new Error("edit tool was not registered");
  return tool;
}

describe("Issue #227: invalid UTF-8 edit corruption", () => {
  it("rejects the edit and preserves every original byte", async () => {
    await ensureHashInit();
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-227-"));
    const filePath = resolve(dir, "invalid-utf8.txt");
    const original = Buffer.concat([
      Buffer.from("alpha\nlatin: ", "utf8"),
      Buffer.from([0xe9]),
      Buffer.from("\nomega\n", "utf8"),
    ]);

    try {
      writeFileSync(filePath, original);
      const tool = captureEditTool();
      const anchor = `1:${computeLineHash(1, "alpha")}`;

      const result = await tool.execute(
        "repro-227",
        { path: filePath, edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect.soft(result.isError).toBe(true);
      expect.soft(result.content[0].text).toBe(`Cannot edit binary file: ${filePath}`);
      expect.soft(result.details.ptcValue.ok).toBe(false);
      expect.soft(result.details.ptcValue.error?.code).toBe("binary-file");
      expect(readFileSync(filePath)).toEqual(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

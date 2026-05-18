import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

function captureEditTool() {
  let tool: any;
  registerEditTool({ registerTool(def: any) { tool = def; } } as any, { wasReadInSession: () => true });
  if (!tool) throw new Error("edit tool was not registered");
  return tool;
}

describe("edit postEditVerify line endings", () => {

  it("confirms persisted LF, CRLF, and BOM-preserving edits", async () => {
    const cases = [
      { name: "lf", original: "alpha\nbeta", expected: "ALPHA\nbeta" },
      { name: "crlf", original: "alpha\r\nbeta", expected: "ALPHA\r\nbeta" },
      { name: "bom-crlf", original: "\uFEFFalpha\r\nbeta", expected: "\uFEFFALPHA\r\nbeta" },
    ];

    for (const testCase of cases) {
      const dir = mkdtempSync(resolve(tmpdir(), `pi-edit-post-verify-${testCase.name}-`));
      const filePath = resolve(dir, "sample.txt");
      writeFileSync(filePath, testCase.original, "utf8");
      const anchor = `1:${computeLineHash(1, "alpha")}`;
      const tool = captureEditTool();

      const result = await tool.execute(
        "tc",
        { path: filePath, postEditVerify: true, edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(result.isError, testCase.name).toBeUndefined();
      expect(readFileSync(filePath, "utf8"), testCase.name).toBe(testCase.expected);
    }
  });
});

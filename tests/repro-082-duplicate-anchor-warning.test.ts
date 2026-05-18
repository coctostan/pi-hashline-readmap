import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

function captureEditTool() {
  let capturedTool: any = null;
  registerEditTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool;
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("issue #082 reproduction — duplicate anchors in one edit batch", () => {
  beforeAll(async () => {
  });

  it("warns when multiple set_line operations target the same anchor in one batch", async () => {
    const tool = captureEditTool();
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-082-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, ["const a = 1;", "const b = 2;", "const c = 3;"].join("\n"), "utf8");

    try {
      const originalLines = readFileSync(filePath, "utf8").split("\n");
      const anchor = `3:${computeLineHash(3, originalLines[2])}`;

      const result = await tool.execute(
        "repro-082-duplicate-anchor-warning",
        {
          path: filePath,
          edits: [
            { set_line: { anchor, new_text: "const c = 30;" } },
            { set_line: { anchor, new_text: "const c = 300;" } },
          ],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(readFileSync(filePath, "utf8")).toContain("const c = 300;");
      expect(result.details?.ptcValue?.warnings).toContain(
        `Warning: multiple edits target the same anchor ${anchor} — only the last will apply`,
      );
      expect(getTextContent(result)).toContain(
        `Warning: multiple edits target the same anchor ${anchor} — only the last will apply`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

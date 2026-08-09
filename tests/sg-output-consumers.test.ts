import { describe, expect, it, vi } from "vitest";
import * as cp from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { buildFileResource } from "../src/context-hygiene.js";
import { registerSgTool } from "../src/sg.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: vi.fn(),
}));

describe("ast_search truncated consumer parity", () => {
  it("retains admitted files for PTC, resources, and anchoring when blocks are hidden", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-ast-consumers-"));
    const files = Array.from({ length: 3 }, (_, index) => join(dir, `file-${index}.ts`));
    files.forEach((file, index) => writeFileSync(file, `const value${index} = ${index};\n`, "utf8"));
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, callback: any) => {
      callback(null, JSON.stringify(files.map((file) => ({
        file,
        range: { start: { line: 0, column: 0 }, end: { line: 0, column: 10 } },
      }))), "");
      return {} as any;
    });

    const onFileAnchored = vi.fn();
    let tool: any;
    registerSgTool(
      { registerTool(def: any) { tool = def; } } as any,
      { outputBudget: { maxLines: 4, maxBytes: 4096 }, onFileAnchored },
    );
    const result = await tool.execute(
      "ast-consumers",
      { pattern: "$X", path: dir, limit: 3 },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const visible = result.content[0].text;

    expect(result.details.ptcValue.files).toHaveLength(3);
    expect(result.details.ptcValue.truncation.outputBudget).toMatchObject({
      totalBlocks: 3,
      shownBlocks: 1,
      omittedBlocks: 2,
    });
    expect(result.details.contextHygiene.resources).toEqual(files.map(buildFileResource));
    for (const file of files) expect(onFileAnchored).toHaveBeenCalledWith(file);
    expect(visible).toContain(basename(files[0]));
    expect(visible).not.toContain(basename(files[1]));
    expect(visible).not.toContain(basename(files[2]));
    expect(visible.split("\n").length).toBeLessThanOrEqual(4);
  });
});

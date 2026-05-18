import { describe, expect, it, beforeEach, vi } from "vitest";
import { computeLineHash } from "../src/hashline.js";

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: fsMock.readFile, writeFile: fsMock.writeFile };
});

import { registerEditTool } from "../src/edit.js";

function captureEditTool() {
  let tool: any;
  registerEditTool({ registerTool(def: any) { tool = def; } } as any, { wasReadInSession: () => true });
  if (!tool) throw new Error("edit tool was not registered");
  return tool;
}

describe("edit postEditVerify mismatch", () => {
  beforeEach(async () => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
  });

  it("returns a structured error when persisted content differs after the write completed", async () => {
    const tool = captureEditTool();
    fsMock.readFile
      .mockResolvedValueOnce(Buffer.from("alpha\nbeta", "utf8"))
      .mockResolvedValueOnce("tampered\nbeta");
    fsMock.writeFile.mockResolvedValue(undefined);
    const anchor = `1:${computeLineHash(1, "alpha")}`;

    const result = await tool.execute(
      "tc",
      { path: "/tmp/post-edit-mismatch.txt", postEditVerify: true, edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("write completed but post-edit verification did not confirm the intended content");
    expect(result.details.ptcValue.ok).toBe(false);
    expect(result.details.ptcValue.error.code).toBe("post-edit-verification-mismatch");
    expect(result.details.ptcValue.error.details).toEqual({ expectedLength: "ALPHA\nbeta".length, actualLength: "tampered\nbeta".length });
    expect(result.details.contextHygiene.classification).toBe("mutation");
    expect(result.details.contextHygiene.resources).toEqual([
      { kind: "file", path: "/tmp/post-edit-mismatch.txt", key: "file:/tmp/post-edit-mismatch.txt" },
    ]);
  });
});

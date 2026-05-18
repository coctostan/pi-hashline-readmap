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

describe("edit postEditVerify pre-write guards", () => {
  beforeEach(async () => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
  });

  it("does not write or read back when a pre-write no-op guard rejects the edit", async () => {
    const tool = captureEditTool();
    fsMock.readFile.mockResolvedValue(Buffer.from("alpha\nbeta", "utf8"));
    fsMock.writeFile.mockResolvedValue(undefined);
    const anchor = `1:${computeLineHash(1, "alpha")}`;

    const result = await tool.execute(
      "tc",
      { path: "/tmp/post-edit-noop.txt", postEditVerify: true, edits: [{ set_line: { anchor, new_text: "alpha" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe("no-op");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);
  });
});

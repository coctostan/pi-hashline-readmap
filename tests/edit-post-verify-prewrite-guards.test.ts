import { describe, expect, it, beforeEach, vi } from "vitest";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

const atomicMock = vi.hoisted(() => ({
  writeFileAtomically: vi.fn(),
  resolveMutationTargetPath: vi.fn(async (p: string) => p),
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, readFile: fsMock.readFile };
});

vi.mock("../src/fs-write.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/fs-write.js")>();
  return {
    ...actual,
    writeFileAtomically: atomicMock.writeFileAtomically,
    resolveMutationTargetPath: atomicMock.resolveMutationTargetPath,
  };
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
    await ensureHashInit();
    fsMock.readFile.mockReset();
    atomicMock.writeFileAtomically.mockReset();
    atomicMock.writeFileAtomically.mockResolvedValue(undefined);
    atomicMock.resolveMutationTargetPath.mockImplementation(async (p: string) => p);
  });

  it("does not write or read back when a pre-write no-op guard rejects the edit", async () => {
    const tool = captureEditTool();
    fsMock.readFile.mockResolvedValue(Buffer.from("alpha\nbeta", "utf8"));
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
    expect(atomicMock.writeFileAtomically).not.toHaveBeenCalled();
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);
  });

  it("routes a real edit through writeFileAtomically", async () => {
    const tool = captureEditTool();
    fsMock.readFile.mockResolvedValue(Buffer.from("alpha\nbeta", "utf8"));
    const anchor = `1:${computeLineHash(1, "alpha")}`;
    const result = await tool.execute(
      "edit-call",
      { path: "/virtual/x.txt", edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
      new AbortController().signal,
      () => {},
      { cwd: "/" },
    );
    expect(result.isError).toBeFalsy();
    expect(atomicMock.writeFileAtomically).toHaveBeenCalledWith("/virtual/x.txt", expect.stringContaining("ALPHA"));
  });
});

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

describe("edit postEditVerify success", () => {
  beforeEach(async () => {
    await ensureHashInit();
    fsMock.readFile.mockReset();
    atomicMock.writeFileAtomically.mockReset();
    atomicMock.resolveMutationTargetPath.mockImplementation(async (p: string) => p);
  });

  it("reads back after a successful opt-in write and preserves the normal success details", async () => {
    const tool = captureEditTool();
    let persisted = "";
    fsMock.readFile
      .mockResolvedValueOnce(Buffer.from("alpha\nbeta", "utf8"))
      .mockImplementationOnce(async () => persisted);
    atomicMock.writeFileAtomically.mockImplementation(async (_path: string, content: string) => { persisted = content; });
    const anchor = `1:${computeLineHash(1, "alpha")}`;

    const result = await tool.execute(
      "tc",
      { path: "/tmp/post-edit-success.txt", postEditVerify: true, edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeUndefined();
    expect(atomicMock.writeFileAtomically).toHaveBeenCalledWith("/tmp/post-edit-success.txt", "ALPHA\nbeta");
    expect(fsMock.readFile).toHaveBeenCalledTimes(2);
    expect(fsMock.readFile.mock.invocationCallOrder[1]).toBeGreaterThan(atomicMock.writeFileAtomically.mock.invocationCallOrder[0]);
    expect(result.content[0].text).toContain("Edited /tmp/post-edit-success.txt");
    expect(result.details.diff).toContain("alpha");
    expect(result.details.diffData).toEqual(result.details.ptcValue.diffData);
    expect(result.details.ptcValue.ok).toBe(true);
    expect(result.details.ptcValue.warnings).toEqual([]);
    expect(result.details.ptcValue.semanticSummary).toBeTruthy();
    expect(result.details.firstChangedLine).toBe(1);
    expect(result.details.contextHygiene.classification).toBe("mutation");
  });
});

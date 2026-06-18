import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureHashInit, computeLineHash } from "../src/hashline.js";

const fsMock = vi.hoisted(() => ({ readFile: vi.fn() }));
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

async function captureEditTool() {
  const { registerEditTool } = await import("../src/edit.js");
  let tool: any;
  registerEditTool({ registerTool(def: any) { tool = def; } } as any);
  return tool;
}

function err(code: string, msg: string): NodeJS.ErrnoException {
  const e: any = new Error(msg);
  e.code = code;
  return e;
}

describe("edit atomic-write fs-error envelope", () => {
  beforeEach(async () => {
    vi.resetModules();
    await ensureHashInit();
    fsMock.readFile.mockReset();
    atomicMock.writeFileAtomically.mockReset();
    atomicMock.resolveMutationTargetPath.mockImplementation(async (p: string) => p);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("EXDEV from writeFileAtomically -> fs-error with fsCode meta", async () => {
    const tool = await captureEditTool();
    fsMock.readFile.mockResolvedValue(Buffer.from("alpha\nbeta", "utf8"));
    atomicMock.writeFileAtomically.mockRejectedValue(err("EXDEV", "EXDEV: cross-device link"));
    const anchor = `1:${computeLineHash(1, "alpha")}`;
    const result = await tool.execute(
      "edit-call",
      { path: "/virtual/x.txt", edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
      new AbortController().signal, () => {}, { cwd: "/" },
    );
    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe("fs-error");
    expect(result.details.ptcValue.error.details?.fsCode).toBe("EXDEV");
  });

  it("EACCES from writeFileAtomically -> permission-denied", async () => {
    const tool = await captureEditTool();
    fsMock.readFile.mockResolvedValue(Buffer.from("alpha\nbeta", "utf8"));
    atomicMock.writeFileAtomically.mockRejectedValue(err("EACCES", "EACCES: denied"));
    const anchor = `1:${computeLineHash(1, "alpha")}`;
    const result = await tool.execute(
      "edit-call",
      { path: "/virtual/x.txt", edits: [{ set_line: { anchor, new_text: "ALPHA" } }] },
      new AbortController().signal, () => {}, { cwd: "/" },
    );
    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe("permission-denied");
  });

  it("no new PTC error codes were introduced", async () => {
    const { PTC_ERROR_CODES } = await import("../src/ptc-error-codes.js");
    const codes = Object.keys(PTC_ERROR_CODES);
    expect(codes).toContain("fs-error");
    expect(codes).toContain("permission-denied");
    // guard: atomic-write work must not add a bespoke code
    expect(codes).not.toContain("atomic-write-failed");
    expect(codes).not.toContain("rename-failed");
  });
});

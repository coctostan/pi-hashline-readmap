import { beforeEach, describe, expect, it, vi } from "vitest";

const writeFileMock = vi.fn(async () => undefined);
const handleWriteFileMock = vi.fn(async () => undefined);
const handleChmodMock = vi.fn(async () => undefined);
const handleCloseMock = vi.fn(async () => undefined);
const openMock = vi.fn(async () => ({
  writeFile: handleWriteFileMock,
  chmod: handleChmodMock,
  close: handleCloseMock,
}));
const renameMock = vi.fn(async () => undefined);
const mkdirMock = vi.fn(async () => undefined);
const unlinkMock = vi.fn(async () => undefined);
const statMock = vi.fn(async () => ({ mode: 0o100600, nlink: 1 }));
const lstatMock = vi.fn(async () => ({ isSymbolicLink: () => false }));
const readlinkMock = vi.fn(async () => "");

vi.mock("node:fs/promises", () => ({
  lstat: lstatMock,
  open: openMock,
  mkdir: mkdirMock,
  readlink: readlinkMock,
  rename: renameMock,
  stat: statMock,
  unlink: unlinkMock,
  writeFile: writeFileMock,
}));

describe("writeFileAtomically permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue({
      writeFile: handleWriteFileMock,
      chmod: handleChmodMock,
      close: handleCloseMock,
    });
    statMock.mockResolvedValue({ mode: 0o100600, nlink: 1 });
    lstatMock.mockResolvedValue({ isSymbolicLink: () => false });
  });

  it("opens a secure temp file (wx, 0o600), writes, chmods to target mode, renames", async () => {
    const { writeFileAtomically } = await import("../src/fs-write.js");
    await writeFileAtomically("/tmp/secret.txt", "secret\n");
    expect(openMock).toHaveBeenCalledWith(expect.stringMatching(/\.tmp-/), "wx", 0o600);
    expect(handleWriteFileMock).toHaveBeenCalledWith("secret\n", "utf-8");
    expect(handleChmodMock).toHaveBeenCalledWith(0o600);
    expect(handleCloseMock).toHaveBeenCalled();
    expect(renameMock).toHaveBeenCalled();
    // hard-link in-place path must NOT be taken for nlink === 1
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("best-effort unlinks the temp file when rename fails", async () => {
    renameMock.mockRejectedValueOnce(Object.assign(new Error("EXDEV"), { code: "EXDEV" }));
    const { writeFileAtomically } = await import("../src/fs-write.js");
    await expect(writeFileAtomically("/tmp/secret.txt", "secret\n")).rejects.toMatchObject({ code: "EXDEV" });
    expect(unlinkMock).toHaveBeenCalledWith(expect.stringMatching(/\.tmp-/));
  });
});

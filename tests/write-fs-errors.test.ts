import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function getWriteTool(behavior?: { throwOnWrite?: NodeJS.ErrnoException }) {
  vi.resetModules();
  if (behavior?.throwOnWrite) {
    vi.doMock("../src/fs-write.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/fs-write.js")>();
      return {
        ...actual,
        resolveMutationTargetPath: async (p: string) => p,
        writeFileAtomically: vi.fn(async (_path: string, _content: string) => {
          throw behavior.throwOnWrite;
        }),
      };
    });
  } else {
    vi.doUnmock("../src/fs-write.js");
  }
  const { registerWriteTool } = await import("../src/write.js");
  let captured: any = null;
  registerWriteTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("write tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function fsErr(code: string, msg: string): NodeJS.ErrnoException {
  const e: any = new Error(msg);
  e.code = code;
  return e;
}

describe("write fs-error mapping", () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "write-fs-errors-"));
  });

  afterEach(() => {
    try {
      rmSync(fixtureDir, { recursive: true, force: true });
    } finally {
      vi.doUnmock("../src/fs-write.js");
      vi.resetModules();
      vi.restoreAllMocks();
    }
  });

  it.each([
    { code: "EACCES", file: "locked.txt", injected: "EACCES: permission denied", prefix: "Permission denied — cannot write: ", mapped: "permission-denied", meta: false },
    { code: "EPERM", file: "locked2.txt", injected: "EPERM: operation not permitted", prefix: "Permission denied — cannot write: ", mapped: "permission-denied", meta: false },
    { code: "EISDIR", file: "somedir", injected: "EISDIR: illegal operation on a directory", prefix: "Path is a directory — cannot overwrite: ", mapped: "path-is-directory", meta: false },
    { code: "ENOSPC", file: "full.txt", injected: "ENOSPC: no space left", prefix: "No space left on device — cannot write: ", mapped: "fs-error", meta: true },
    { code: "EROFS", file: "readonly.txt", injected: "EROFS: read-only file system", prefix: "Read-only filesystem — cannot write: ", mapped: "fs-error", meta: true },
    { code: "EXDEV", file: "x.txt", injected: "EXDEV: cross-device link", prefix: "Error writing ", mapped: "fs-error", meta: true },
  ])("$code on write reaches the injected failure and maps its envelope", async (row) => {
    const filePath = join(fixtureDir, row.file);
    const injected = fsErr(row.code, row.injected);
    const tool = await getWriteTool({ throwOnWrite: injected });
    const { writeFileAtomically } = await import("../src/fs-write.js");
    const result = await tool.execute(
      "tc", { path: filePath, content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(writeFileAtomically).toHaveBeenCalledTimes(1);
    expect(writeFileAtomically).toHaveBeenCalledWith(filePath, "hi");
    expect(result.isError).toBe(true);
    const message = row.code === "EXDEV"
      ? `${row.prefix}${filePath}: ${row.injected}`
      : `${row.prefix}${filePath}`;
    expect(text(result)).toBe(message);
    expect(result.details?.ptcValue?.error?.code).toBe(row.mapped);
    if (row.meta) {
      expect(result.details?.ptcValue?.error?.details?.fsCode).toBe(row.code);
    }
  });

  it("regression: successful write still returns hashlined output", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "write-ok-"));
    try {
      const tool = await getWriteTool();
      const result = await tool.execute(
        "tc", { path: join(dir, "ok.txt"), content: "hello\nworld" },
        new AbortController().signal, undefined, { cwd: process.cwd() },
      );
      expect(result.isError).toBeFalsy();
      expect(text(result)).toMatch(/^1:[0-9a-f]{3}\|hello$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

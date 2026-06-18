import { describe, it, expect, vi, afterEach } from "vitest";

async function getWriteTool(behavior?: { throwOnWrite?: NodeJS.ErrnoException }) {
  vi.resetModules();
  if (behavior?.throwOnWrite) {
    vi.doMock("../src/fs-write.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/fs-write.js")>();
      return {
        ...actual,
        resolveMutationTargetPath: async (p: string) => p,
        writeFileAtomically: async () => { throw behavior.throwOnWrite; },
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
  afterEach(() => {
    vi.doUnmock("../src/fs-write.js");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("EACCES on write -> 'Permission denied — cannot write: <path>'", async () => {
    const tool = await getWriteTool({ throwOnWrite: fsErr("EACCES", "EACCES: permission denied") });
    const result = await tool.execute(
      "tc", { path: "/root/locked.txt", content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Permission denied — cannot write: /root/locked.txt");
    expect(result.details?.ptcValue?.error?.code).toBe("permission-denied");
  });

  it("EPERM on write -> same permission-denied mapping", async () => {
    const tool = await getWriteTool({ throwOnWrite: fsErr("EPERM", "EPERM: operation not permitted") });
    const result = await tool.execute(
      "tc", { path: "/root/locked2.txt", content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(text(result)).toBe("Permission denied — cannot write: /root/locked2.txt");
    expect(result.details?.ptcValue?.error?.code).toBe("permission-denied");
  });

  it("EISDIR on write -> 'Path is a directory — cannot overwrite: <path>'", async () => {
    const tool = await getWriteTool({ throwOnWrite: fsErr("EISDIR", "EISDIR: illegal operation on a directory") });
    const result = await tool.execute(
      "tc", { path: "/tmp/somedir", content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(text(result)).toBe("Path is a directory — cannot overwrite: /tmp/somedir");
    expect(result.details?.ptcValue?.error?.code).toBe("path-is-directory");
  });

  it("ENOSPC on write -> fs-error with No space message", async () => {
    const tool = await getWriteTool({ throwOnWrite: fsErr("ENOSPC", "ENOSPC: no space left") });
    const result = await tool.execute(
      "tc", { path: "/tmp/full.txt", content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(text(result)).toBe("No space left on device — cannot write: /tmp/full.txt");
    expect(result.details?.ptcValue?.error?.code).toBe("fs-error");
  });

  it("EROFS on write -> 'Read-only filesystem — cannot write: <path>'", async () => {
    const tool = await getWriteTool({ throwOnWrite: fsErr("EROFS", "EROFS: read-only file system") });
    const result = await tool.execute(
      "tc", { path: "/readonly/file.txt", content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(text(result)).toBe("Read-only filesystem — cannot write: /readonly/file.txt");
    expect(result.details?.ptcValue?.error?.code).toBe("fs-error");
  });

  it("EXDEV on write -> fs-error with fsCode meta", async () => {
    const tool = await getWriteTool({ throwOnWrite: fsErr("EXDEV", "EXDEV: cross-device link") });
    const result = await tool.execute(
      "tc", { path: "/tmp/x.txt", content: "hi" },
      new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    expect(result.details?.ptcValue?.error?.code).toBe("fs-error");
    expect(result.details?.ptcValue?.error?.details?.fsCode).toBe("EXDEV");
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

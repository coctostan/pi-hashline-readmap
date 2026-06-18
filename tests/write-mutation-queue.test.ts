import { afterEach, describe, expect, it, vi } from "vitest";

describe("write Pi file mutation queue integration", () => {
  afterEach(() => {
    vi.doUnmock("@earendil-works/pi-coding-agent");
    vi.doUnmock("../src/fs-write.js");
    vi.resetModules();
  });

  it("wraps write's window in Pi's queue, keyed on the resolved target path", async () => {
    vi.resetModules();
    const events: string[] = [];
    const filePath = "/virtual/write-queue.txt";

    vi.doMock("@earendil-works/pi-coding-agent", async () => {
      const actual = await vi.importActual<any>("@earendil-works/pi-coding-agent");
      return {
        ...actual,
        withFileMutationQueue: vi.fn(async (queuedPath: string, fn: () => Promise<unknown>) => {
          events.push(`queue-enter:${queuedPath}`);
          const result = await fn();
          events.push(`queue-exit:${queuedPath}`);
          return result;
        }),
      };
    });

    vi.doMock("../src/fs-write.js", async () => {
      const actual = await vi.importActual<any>("../src/fs-write.js");
      return {
        ...actual,
        resolveMutationTargetPath: vi.fn(async (p: string) => p),
        writeFileAtomically: vi.fn(async (targetPath: string, content: string) => {
          events.push(`atomic-write:${targetPath}:${content}`);
        }),
      };
    });

    const { registerWriteTool } = await import("../src/write.js");
    let tool: any;
    registerWriteTool({ registerTool(def: any) { tool = def; } } as any);

    const result = await tool.execute(
      "write-queue",
      { path: filePath, content: "queued content" },
      new AbortController().signal,
      () => {},
      { cwd: "/" },
    );

    expect(result.isError).not.toBe(true);
    expect(events[0]).toBe(`queue-enter:${filePath}`);
    expect(events).toContain(`atomic-write:${filePath}:queued content`);
    expect(events[events.length - 1]).toBe(`queue-exit:${filePath}`);
  });
});

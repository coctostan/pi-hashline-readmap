import { afterEach, describe, expect, it, vi } from "vitest";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("repro 160 — Pi file mutation queue integration", () => {
  afterEach(() => {
    vi.doUnmock("fs/promises");
    vi.doUnmock("../src/fs-write.js");
    vi.resetModules();
  });

  it("serializes edit's full read-modify-write window for same-file parallel calls", async () => {
    vi.resetModules();

    const filePath = "/virtual/race.txt";
    let fileContent = "alpha\nbeta\n";

    vi.doMock("fs/promises", () => ({
      readFile: vi.fn(async () => {
        await tick();
        return Buffer.from(fileContent, "utf-8");
      }),
    }));

    vi.doMock("../src/fs-write.js", async () => {
      const actual = await vi.importActual<any>("../src/fs-write.js");
      return {
        ...actual,
        resolveMutationTargetPath: vi.fn(async (p: string) => p),
        writeFileAtomically: vi.fn(async (_path: string, content: string | Buffer) => {
          await tick();
          fileContent = content.toString();
        }),
      };
    });

    const { registerEditTool } = await import("../src/edit.js");
    let tool: any;
    registerEditTool(
      { registerTool(def: any) { tool = def; } } as any,
      { wasReadInSession: () => true, syntaxValidate: "off" },
    );

    const resultPromiseA = tool.execute(
      "edit-alpha",
      { path: filePath, edits: [{ replace: { old_text: "alpha", new_text: "ALPHA" } }] },
      new AbortController().signal,
      () => {},
      { cwd: "/" },
    );
    const resultPromiseB = tool.execute(
      "edit-beta",
      { path: filePath, edits: [{ replace: { old_text: "beta", new_text: "BETA" } }] },
      new AbortController().signal,
      () => {},
      { cwd: "/" },
    );

    const results = await Promise.all([resultPromiseA, resultPromiseB]);

    expect(results.map((result: any) => result.isError ?? false)).toEqual([false, false]);
    expect(fileContent).toBe("ALPHA\nBETA\n");
  });
});

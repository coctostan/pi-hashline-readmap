import { afterEach, describe, expect, it, vi } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<any>("node:child_process");
  return {
    ...actual,
    execFile: vi.fn(),
    execFileSync: vi.fn(() => Buffer.from("ast-grep 0.42.2\n")),
  };
});

async function captureSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  registerSgTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("ast_search binary resolution", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/binary-resolution.js");
    vi.clearAllMocks();
  });

  it("executes the npm-provided sg binary when it resolves", async () => {
    const resolveBundledBin = vi.fn(() => "/mock/node_modules/@ast-grep/cli/bin/sg");
    vi.doMock("../src/binary-resolution.js", () => ({ resolveBundledBin, executableCommand: (command: string) => ({ command, argsPrefix: [] }) }));

    const tool = await captureSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute("tc", { pattern: "console.log($$$ARGS)" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(resolveBundledBin).toHaveBeenCalledWith("@ast-grep/cli", "sg", "sg");
    expect(vi.mocked(cp.execFile).mock.calls[0][0]).toBe("/mock/node_modules/@ast-grep/cli/bin/sg");
  });

  it("executes PATH sg when the npm-provided binary is unavailable", async () => {
    const resolveBundledBin = vi.fn((_packageName: string, _binName: string, fallbackCommand: string) => fallbackCommand);
    vi.doMock("../src/binary-resolution.js", () => ({ resolveBundledBin, executableCommand: (command: string) => ({ command, argsPrefix: [] }) }));

    const tool = await captureSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute("tc", { pattern: "console.log($$$ARGS)" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(resolveBundledBin).toHaveBeenCalledWith("@ast-grep/cli", "sg", "sg");
    expect(vi.mocked(cp.execFile).mock.calls[0][0]).toBe("sg");
  });
});

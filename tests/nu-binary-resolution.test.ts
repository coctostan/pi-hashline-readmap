import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cp from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<any>("node:child_process");
  return {
    ...actual,
    execFileSync: vi.fn(() => Buffer.from("0.112.2\n")),
    spawn: vi.fn(),
  };
});

function mockSpawnClose(stdout = "ok\n", exitCode = 0) {
  vi.mocked(cp.spawn).mockImplementation((_cmd: any, _args: any, _opts: any) => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();
    queueMicrotask(() => {
      proc.stdout.emit("data", Buffer.from(stdout));
      proc.emit("close", exitCode);
    });
    return proc;
  });
}

async function captureNuTool() {
  const { registerNuTool } = await import("../src/nu.js");
  const pi = { registerTool: vi.fn() };
  const tool = registerNuTool(pi as any);
  if (!tool) throw new Error("nu tool was not registered");
  return tool;
}

describe("nu binary resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/binary-resolution.js");
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../src/binary-resolution.js");
    vi.clearAllMocks();
  });

  it("checks availability and executes with the npm-provided nu binary when it resolves", async () => {
    const resolveBundledBin = vi.fn(() => "/mock/node_modules/nushell/nu");
    vi.doMock("../src/binary-resolution.js", () => ({ resolveBundledBin, executableCommand: (command: string) => ({ command, argsPrefix: [] }) }));
    mockSpawnClose("ok\n", 0);

    const tool = await captureNuTool();
    await tool.execute("tc", { command: "echo ok" }, undefined, undefined, { cwd: process.cwd() } as any);

    expect(resolveBundledBin).toHaveBeenCalledWith("nushell", "nu", "nu");
    expect(vi.mocked(cp.execFileSync).mock.calls[0][0]).toBe("/mock/node_modules/nushell/nu");
    expect(vi.mocked(cp.spawn).mock.calls[0][0]).toBe("/mock/node_modules/nushell/nu");
  });

  it("checks availability and executes with PATH nu when the npm-provided binary is unavailable", async () => {
    const resolveBundledBin = vi.fn((_packageName: string, _binName: string, fallbackCommand: string) => fallbackCommand);
    vi.doMock("../src/binary-resolution.js", () => ({ resolveBundledBin, executableCommand: (command: string) => ({ command, argsPrefix: [] }) }));
    mockSpawnClose("ok\n", 0);

    const tool = await captureNuTool();
    await tool.execute("tc", { command: "echo ok" }, undefined, undefined, { cwd: process.cwd() } as any);

    expect(resolveBundledBin).toHaveBeenCalledWith("nushell", "nu", "nu");
    expect(vi.mocked(cp.execFileSync).mock.calls[0][0]).toBe("nu");
    expect(vi.mocked(cp.spawn).mock.calls[0][0]).toBe("nu");
  });
});

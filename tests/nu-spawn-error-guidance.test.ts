import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("node:child_process");
});

describe("nu spawn error guidance", () => {
  it("keeps nu-spawn-error while mentioning the npm nushell dependency and PATH fallback", async () => {
    vi.mocked(cp.spawn).mockImplementation(() => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();
      queueMicrotask(() => {
        const err = Object.assign(new Error("spawn nu ENOENT"), { code: "ENOENT" });
        proc.emit("error", err);
      });
      return proc;
    });

    const { registerNuTool } = await import("../src/nu.js");
    const pi = { registerTool: vi.fn() };
    const tool = registerNuTool(pi as any);
    if (!tool) throw new Error("nu tool was not registered");

    const result = await tool.execute("tc", { command: "echo ok" }, undefined, undefined, { cwd: process.cwd() } as any);
    const text = (result.content[0] as { text: string }).text;
    const ptc = (result.details as any).ptcValue;

    expect(text).toContain("bundled npm package 'nushell'");
    expect(text).toContain("install Nushell on PATH as a fallback");
    expect(ptc.error.code).toBe("nu-spawn-error");
    expect(ptc.error.hint).toContain("nushell");
    expect(ptc.error.hint).toContain("PATH");
  });
});

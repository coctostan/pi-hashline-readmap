import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg cli args", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds -l when lang is provided and omits it otherwise", async () => {
    const tool = await getSgTool();

    const calls: string[][] = [];
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute("tc", { pattern: "p", lang: "python" }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await tool.execute("tc", { pattern: "p" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(calls[0]).toContain("-l");
    expect(calls[0]).toContain("python");
    expect(calls[1]).not.toContain("-l");
  });
});

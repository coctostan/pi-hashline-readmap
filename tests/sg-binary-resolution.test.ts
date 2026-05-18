import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("ast_search binary resolution", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports available when ast-grep is on PATH even if sg is not", async () => {
    const { isSgAvailable } = await import("../src/sg.js");
    vi.mocked(cp.execFileSync).mockImplementation((cmd: any) => {
      if (cmd === "ast-grep") return Buffer.from("ast-grep 0.42.1");
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    });

    expect(isSgAvailable()).toBe(true);
  });

  it("executes ast-grep when ast-grep is on PATH", async () => {
    const tool = await getSgTool();
    vi.mocked(cp.execFileSync).mockImplementation((cmd: any) => {
      if (cmd === "ast-grep") return Buffer.from("ast-grep 0.42.1");
      throw Object.assign(new Error("not found"), { code: "ENOENT" });
    });

    let command = "";
    vi.mocked(cp.execFile).mockImplementation((cmd: any, _args: any, _opts: any, cb: any) => {
      command = cmd;
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute("tc", { pattern: "console.log($$$ARGS)" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(command).toBe("ast-grep");
  });

  it("falls back to sg when ast-grep is not on PATH", async () => {
    const tool = await getSgTool();
    vi.mocked(cp.execFileSync).mockImplementation((cmd: any) => {
      if (cmd === "ast-grep") throw Object.assign(new Error("not found"), { code: "ENOENT" });
      return Buffer.from("ast-grep 0.42.1");
    });

    let command = "";
    vi.mocked(cp.execFile).mockImplementation((cmd: any, _args: any, _opts: any, cb: any) => {
      command = cmd;
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute("tc", { pattern: "console.log($$$ARGS)" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(command).toBe("sg");
  });
});

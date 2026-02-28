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

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("sg execute errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns helpful error when sg is not installed", async () => {
    const tool = await getSgTool();

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("command not found: sg");
      err.code = "ENOENT";
      cb(err, "", "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "console.log($$$ARGS)" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("ast-grep (sg) is not installed. Run: brew install ast-grep");
  });

  it("returns stderr when sg exits non-zero", async () => {
    const tool = await getSgTool();

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("sg failed");
      err.code = 2;
      cb(err, "", "Error: invalid pattern");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "{{bad" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("invalid pattern");
  });
});

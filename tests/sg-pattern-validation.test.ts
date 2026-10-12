import { describe, it, expect, vi, beforeEach } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  registerSgTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("ast_search pattern validation (#272)", () => {
  beforeEach(() => {
    vi.mocked(cp.execFile).mockReset();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "[]", "");
      return {} as any;
    });
  });

  it.each(["", "   ", "\n\t"])("rejects %j before spawning ast-grep", async (pattern) => {
    const tool = await getSgTool();

    const result = await tool.execute(
      "tc",
      { pattern, lang: "javascript" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Invalid pattern: expected a non-empty ast-grep pattern.");
    expect(result.details?.ptcValue).toMatchObject({
      tool: "ast_search",
      ok: false,
      error: { code: "invalid-pattern", message: "Invalid pattern: expected a non-empty ast-grep pattern." },
    });
    expect(vi.mocked(cp.execFile)).not.toHaveBeenCalled();
  });

  it("documents invalid-pattern in the error-code taxonomy", async () => {
    const { PTC_ERROR_CODES } = await import("../src/ptc-error-codes.js");
    expect(PTC_ERROR_CODES).toHaveProperty("invalid-pattern");
  });
});

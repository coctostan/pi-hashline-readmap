import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

const BANNER =
  "[warn] postinstall script did not run; falling back to runtime binary resolution.\n"
  + "Enable postinstall to avoid the per-invocation overhead.\n";
const CLAP_ERROR =
  "error: invalid value 'klingon' for '--lang <LANG>': klingon is not supported!\n\n"
  + "For more information, try '--help'.\n";
const CLAP_ERROR_TRIMMED =
  "error: invalid value 'klingon' for '--lang <LANG>': klingon is not supported!\n\n"
  + "For more information, try '--help'.";

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

describe("ast_search stderr sanitizing (#272)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sanitizeSgStderr removes only the @ast-grep/cli postinstall shim banner", async () => {
    const { sanitizeSgStderr } = await import("../src/sg.js");
    expect(sanitizeSgStderr(BANNER + CLAP_ERROR)).toBe(CLAP_ERROR_TRIMMED);
    expect(sanitizeSgStderr(BANNER)).toBe("");
    expect(sanitizeSgStderr("Error: real failure\n")).toBe("Error: real failure");
    expect(sanitizeSgStderr("")).toBe("");
  });

  it("never surfaces the banner in ast_search error text", async () => {
    const tool = await getSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("Command failed: sg run");
      err.code = 2;
      cb(err, "", BANNER + CLAP_ERROR);
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "$X", lang: "klingon" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(CLAP_ERROR_TRIMMED);
    expect(result.details?.ptcValue?.error).toMatchObject({ code: "sg-execution-error", message: CLAP_ERROR_TRIMMED });
  });

  it("falls back to the process error message when stderr is only the banner", async () => {
    const tool = await getSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("Command failed: sg run");
      err.code = 2;
      cb(err, "", BANNER);
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "$X" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("Command failed: sg run");
  });
});

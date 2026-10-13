import { describe, it, expect, vi, beforeEach } from "vitest";
import * as cp from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

const ERROR_NODE_WARNING =
  "Warning: Pattern contains an ERROR node and may cause unexpected results.\n"
  + "Help: ast-grep parsed the pattern but it matched nothing in this run. Try using playground to refine the pattern.\n"
  + "See also: https://ast-grep.github.io/playground.html\n";

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

function run(tool: any, params: Record<string, unknown>) {
  return tool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("ast_search malformed-pattern detection (#272)", () => {
  beforeEach(() => {
    vi.mocked(cp.execFile).mockReset();
  });

  it("reports a parse failure when ast-grep warns about an ERROR node and nothing matched", async () => {
    const tool = await getSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "[]", ERROR_NODE_WARNING);
      return {} as any;
    });

    const result = await run(tool, { pattern: "foo(", lang: "javascript" });

    const expected =
      "Pattern failed to parse: foo(\n"
      + "ast-grep parsed this pattern as javascript with a syntax ERROR node, so it cannot match. "
      + "Make the pattern a complete, valid code fragment (balanced brackets; a full expression or statement).";
    expect(result.isError).toBe(true);
    expect(text(result)).toBe(expected);
    expect(text(result)).not.toContain("No matches found");
    expect(result.details?.ptcValue).toMatchObject({
      tool: "ast_search",
      ok: false,
      error: { code: "pattern-parse-error", message: expected },
    });
  });

  it("keeps 'No matches found' for a valid pattern with no matches (exit 1, empty stderr)", async () => {
    const tool = await getSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("Command failed");
      err.code = 1;
      cb(err, "[]", "");
      return {} as any;
    });

    const result = await run(tool, { pattern: "nonexistentCall123($X)", lang: "javascript" });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe("No matches found for pattern: nonexistentCall123($X)");
  });

  it("documents pattern-parse-error in the error-code taxonomy", async () => {
    const { PTC_ERROR_CODES } = await import("../src/ptc-error-codes.js");
    expect(PTC_ERROR_CODES).toHaveProperty("pattern-parse-error");
  });
});

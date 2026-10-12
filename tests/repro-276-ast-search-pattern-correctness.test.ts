/**
 * Reproduction for #276 / #272: ast_search pattern correctness.
 * Uses the real bundled ast-grep binary (no child_process mock).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { registerSgTool, isSgAvailable } from "../src/sg.js";

function getSgTool(): any {
  let captured: any = null;
  registerSgTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe.skipIf(!isSgAvailable())("#276 ast_search pattern correctness", () => {
  let dir = "";
  let file = "";
  const tool = getSgTool();
  const run = (pattern: string, extra: Record<string, unknown> = {}) =>
    tool.execute("tc", { pattern, path: file, lang: "javascript", ...extra }, new AbortController().signal, () => {}, { cwd: dir });

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "repro-276-sg-"));
    file = path.join(dir, "a.js");
    writeFileSync(file, "let i = 0;\n--i;\nconst y = 1;\nconst z = -y;\n", "utf8");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("pattern '--$A' finds the pre-decrement '--i' instead of being parsed as a CLI flag", async () => {
    const result = await run("--$A");
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("--i;");
  });

  it("pattern '-$A' finds the negation '-y'", async () => {
    const result = await run("-$A");
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain("const z = -y;");
  });

  it("pattern '--help' is treated as a pattern, not a CLI flag", async () => {
    const result = await run("--help");
    expect(text(result)).not.toContain("a value is required for '--pattern");
  });

  it.each(["function (((", "foo("])("malformed pattern %j reports a parse failure, not 'No matches'", async (pattern) => {
    const result = await run(pattern);
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/parse/i);
    expect(text(result)).not.toContain("No matches found");
  });

  it.each(["", "   "])("empty/whitespace pattern %j is rejected up front without ast-grep noise", async (pattern) => {
    const result = await run(pattern);
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain("postinstall");
    expect(text(result)).not.toContain("No matches found");
  });

  it("a valid pattern with no matches still reports 'No matches found'", async () => {
    const result = await run("nonexistentCall123($X)");
    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe("No matches found for pattern: nonexistentCall123($X)");
  });

  it("surfaced ast-grep errors never contain the postinstall banner", async () => {
    const result = await run("$X", { lang: "klingon" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("klingon");
    expect(text(result)).not.toContain("postinstall");
  });
});

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

// Runs through Pi's built-in grep and the real `rg`; expected texts are rg 15.2.0's own stderr.

function captureGrepTool(): any {
  let tool: any;
  registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
  return tool;
}

function scratchFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-grep-regex-hint-"));
  const filePath = join(dir, "sample.txt");
  writeFileSync(filePath, "foo(?=bar) stays literal\nplain line\n", "utf8");
  return filePath;
}

async function grep(params: Record<string, unknown>) {
  return captureGrepTool().execute(
    "grep-regex-hint",
    params,
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

async function rejection(params: Record<string, unknown>): Promise<string> {
  try {
    await grep(params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("grep did not reject");
}

describe("grep regex parse errors point at literal mode", () => {
  it("keeps ripgrep's error whole and then names literal: true", async () => {
    const message = await rejection({ pattern: "foo(", path: scratchFile() });
    const rgText = "rg: regex parse error:\n    (?:foo()\n    ^\nerror: unclosed group";
    expect(message.startsWith(`${rgText}\n\n`)).toBe(true);
    const hint = message.slice(rgText.length + 2);
    expect(hint).toContain("literal: true");
    expect(hint).not.toMatch(/look-around/i);
  });

  it.each(["foo(?=bar)", "(?<!x)foo", "(?!x)foo", "(?<=x)foo"])(
    "tells %s that ripgrep has no look-around",
    async (pattern) => {
      const message = await rejection({ pattern, path: scratchFile() });
      expect(message).toContain("regex parse error");
      const hint = message.slice(message.lastIndexOf("\n\n") + 2);
      expect(hint).toContain("literal: true");
      expect(hint).toMatch(/ripgrep has no look-around/);
    },
  );

  it("leaves a missing path's error without the hint", async () => {
    const message = await rejection({ pattern: "foo(", path: join(tmpdir(), "pi-grep-no-such-dir-xyz", "nope.txt") });
    expect(message).toContain("Path not found");
    expect(message).not.toContain("literal: true");
  });

  it("finds look-ahead text when sent with literal: true", async () => {
    const result = await grep({ pattern: "foo(?=bar)", path: scratchFile(), literal: true });
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain("foo(?=bar) stays literal");
  });
});

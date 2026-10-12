import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";

async function callRead(params: Record<string, unknown>): Promise<any> {
  let tool: any;
  registerReadTool({ registerTool(def: any) { tool = def; } } as any);
  return tool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const textOf = (result: any): string => result.content.find((c: any) => c.type === "text")?.text ?? "";
function fixture(content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-"));
  const path = resolve(dir, "f.txt");
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("read window params — value errors", () => {
  it.each([
    [{ charOffset: -1 }, "invalid-char-offset", "Invalid charOffset: expected a non-negative integer, received -1."],
    [{ charOffset: 1.5 }, "invalid-char-offset", "Invalid charOffset: expected a base-10 integer, received 1.5."],
    [{ charOffset: "abc" }, "invalid-char-offset", 'Invalid charOffset: expected a base-10 integer, received "abc".'],
    [{ charOffset: true }, "invalid-char-offset", "Invalid charOffset: expected a base-10 integer, received true."],
    [{ charLimit: 0 }, "invalid-char-limit", "Invalid charLimit: expected a positive integer, received 0."],
    [{ charLimit: -5 }, "invalid-char-limit", "Invalid charLimit: expected a positive integer, received -5."],
    [{ charLimit: "x" }, "invalid-char-limit", 'Invalid charLimit: expected a base-10 integer, received "x".'],
  ])("fails %j with a coded error", async (extra, code, message) => {
    const path = fixture("a\nb\n");
    const result = await callRead({ path, offset: 1, ...extra });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(message);
    expect(result.details.ptcValue).toMatchObject({ tool: "read", ok: false, error: { code, message } });
  });

  it("ignores empty-string window params with a params-adjusted notice and reads normally", async () => {
    const path = fixture("one\ntwo\nthree\n");
    const result = await callRead({ path, offset: 2, charOffset: "", charLimit: "" });
    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(text.startsWith("[Read params adjusted: ignored empty charOffset; ignored empty charLimit]")).toBe(true);
    expect(text).toContain("|two");
    expect(result.details.ptcValue.warnings[0].code).toBe("params-adjusted");
    expect("window" in result.details.ptcValue).toBe(false);
    expect(result.details.contextHygiene.rehydrate).toEqual({ tool: "read", input: { path, offset: 2 } });
  });
});

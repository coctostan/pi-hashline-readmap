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
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-end-"));
  const path = resolve(dir, "f.txt");
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("read window — charOffset past end of line", () => {
  it.each([5, 6, 99])("fails with char-offset-past-end for charOffset %i on a 5-char line", async (charOffset) => {
    const path = fixture("hello");
    const result = await callRead({ path, offset: 1, charOffset });
    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toBe(`[charOffset ${charOffset} is past end of line 1 (5 chars)]`);
    expect(result.details.ptcValue).toMatchObject({ tool: "read", ok: false, error: { code: "char-offset-past-end", message: text } });
  });

  it("counts escaped control characters as display chars", async () => {
    const path = fixture("a\u0001b"); // displays as a\u0001b = 8 chars
    const result = await callRead({ path, offset: 1, charOffset: 8 });
    expect(textOf(result)).toBe("[charOffset 8 is past end of line 1 (8 chars)]");
  });

  it("treats an empty line as having no window", async () => {
    const path = fixture("first\n\nthird\n");
    const result = await callRead({ path, offset: 2, charOffset: 0 });
    expect(result.isError).toBe(true);
    expect(result.details.ptcValue.error.code).toBe("char-offset-past-end");
    expect(textOf(result)).toBe("[charOffset 0 is past end of line 2 (0 chars)]");
  });
});

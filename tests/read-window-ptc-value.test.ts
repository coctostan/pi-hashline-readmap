import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { registerReadTool } from "../src/read.js";

async function callRead(params: Record<string, unknown>): Promise<any> {
  let tool: any;
  registerReadTool({ registerTool(def: any) { tool = def; } } as any);
  return tool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}
const textOf = (result: any): string => result.content.find((c: any) => c.type === "text")?.text ?? "";
function fixture(lines: string[]): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-ptc-"));
  const path = resolve(dir, "f.txt");
  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}

describe("read window — ptcValue", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("describes the window and keeps the full-line anchor", async () => {
    const raw = "x".repeat(1200);
    const path = fixture(["first", raw, "third"]);
    const result = await callRead({ path, offset: 2, charOffset: 0 });
    const ptc = result.details.ptcValue;
    const hash = computeLineHash(2, raw);
    expect(ptc).toMatchObject({
      tool: "read",
      path,
      range: { startLine: 2, endLine: 2, totalLines: 3 },
      warnings: [],
      truncation: null,
      continuation: null,
      symbol: null,
      map: { requested: false, appended: false },
      window: { line: 2, charOffset: 0, charLimit: 500, length: 500, totalChars: 1200, remainingChars: 700, nextCharOffset: 500 },
    });
    expect(ptc.lines).toEqual([
      { line: 2, hash, anchor: `2:${hash}`, raw: "x".repeat(500), display: "x".repeat(500) },
    ]);
  });

  it("reports a null nextCharOffset at the end of the line", async () => {
    const path = fixture(["x".repeat(600)]);
    const result = await callRead({ path, offset: 1, charOffset: 500 });
    expect(result.details.ptcValue.window).toMatchObject({ length: 100, remainingChars: 0, nextCharOffset: null });
  });

  it("omits the window key on ordinary reads", async () => {
    const path = fixture(["a", "b"]);
    const result = await callRead({ path });
    expect("window" in result.details.ptcValue).toBe(false);
  });

  it("recovers a 25,000-char line in 3 bounded calls by following nextCharOffset", async () => {
    const full = Array.from({ length: 25_000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join("");
    const path = fixture([full]);
    const slices: string[] = [];
    let next: number | null = 0;
    let calls = 0;
    while (next !== null) {
      const result = await callRead({ path, offset: 1, charOffset: next, charLimit: 10_000 });
      calls++;
      expect(textOf(result).length).toBeLessThan(10_000 + 400);
      slices.push(result.details.ptcValue.lines[0].display);
      next = result.details.ptcValue.window.nextCharOffset;
      if (next !== null) expect(textOf(result)).toContain(`charOffset: ${next}, charLimit: 10000 })`);
    }
    expect(calls).toBe(3);
    expect(slices.join("")).toBe(full);
  });
});

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import init from "../index.js";

const ctx = { cwd: process.cwd() };
function harness() {
  const tools: Record<string, any> = {};
  init({
    registerTool(def: any) { tools[def.name] = def; },
    on() {},
    events: { emit() {}, on() {} },
  } as any);
  return tools;
}
const textOf = (result: any): string => result.content.find((c: any) => c.type === "text")?.text ?? "";
function fixture(lines: string[]): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-window-ok-"));
  const path = resolve(dir, "f.txt");
  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}

describe("read window — success path", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });
  const longLine = "y".repeat(1200);

  it("returns only the selected line's first 500 chars with the full-line anchor for charOffset 0", async () => {
    const tools = harness();
    const path = fixture(["first", longLine, "third"]);
    const result = await tools.read.execute("t", { path, offset: 2, charOffset: 0 }, undefined, () => {}, ctx);
    const text = textOf(result);
    expect(text.startsWith("[Read params adjusted")).toBe(false);
    expect(text.split("\n")[0]).toBe(`2:${computeLineHash(2, longLine)}|${"y".repeat(500)}`);
    expect(text).toContain(`[Showing chars 0-500 of 1200 on line 2 (700 remaining). Continue with read({ path: ${JSON.stringify(path)}, offset: 2, charOffset: 500 }).]`);
    expect(text).not.toContain("first");
    expect(text).not.toContain("third");
  });

  it("honours charOffset and charLimit", async () => {
    const tools = harness();
    const path = fixture(["first", longLine, "third"]);
    const result = await tools.read.execute("t", { path, offset: 2, charOffset: 500, charLimit: 300 }, undefined, () => {}, ctx);
    const text = textOf(result);
    expect(text.split("\n")[0]).toBe(`2:${computeLineHash(2, longLine)}|${"y".repeat(300)}`);
    expect(text).toContain("[Showing chars 500-800 of 1200 on line 2 (400 remaining).");
    expect(text).toContain("offset: 2, charOffset: 800, charLimit: 300 })");
  });

  it("starts at 0 when only charLimit is supplied", async () => {
    const tools = harness();
    const path = fixture(["first", longLine]);
    const result = await tools.read.execute("t", { path, offset: 2, charLimit: 100 }, undefined, () => {}, ctx);
    expect(textOf(result)).toContain("[Showing chars 0-100 of 1200 on line 2 (1100 remaining).");
  });

  it("clamps charLimit above 10,000 and says so", async () => {
    const tools = harness();
    const path = fixture(["z".repeat(12_000)]);
    const result = await tools.read.execute("t", { path, offset: 1, charLimit: 50_000 }, undefined, () => {}, ctx);
    const text = textOf(result);
    expect(text.startsWith("[Read params adjusted: clamped charLimit 50000 to 10000]")).toBe(true);
    expect(text).toContain("[Showing chars 0-10000 of 12000 on line 1 (2000 remaining).");
    expect(text).toContain("charOffset: 10000, charLimit: 10000 })");
  });

  it("produces an anchor that edit accepts for the unchanged long line", async () => {
    const tools = harness();
    const path = fixture(["short", longLine]);
    const read = await tools.read.execute("t", { path, offset: 2, charOffset: 0 }, undefined, () => {}, ctx);
    const anchor = textOf(read).split("\n")[0].split("|")[0];
    expect(anchor).toBe(`2:${computeLineHash(2, longLine)}`);
    const edit = await tools.edit.execute(
      "e",
      { path, edits: [{ set_line: { anchor, new_text: "replaced();" } }] },
      undefined,
      () => {},
      ctx,
    );
    expect(edit.isError).not.toBe(true);
    expect(readFileSync(path, "utf-8")).toBe("short\nreplaced();");
  });
});

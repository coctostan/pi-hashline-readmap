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
function fixture(lines: string[], name = "f.txt"): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-read-line-cap-"));
  const path = resolve(dir, name);
  writeFileSync(path, lines.join("\n"), "utf-8");
  return path;
}
const marker = (total: number, line: number, shown: number, range?: number) =>
  `... [truncated, ${total} chars total; read({offset:${line}, charOffset:${shown}})${range === undefined ? "" : ` or a range read with charLimit:${range}`}]`;

describe("read — charLimit without charOffset caps each line of the range", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });
  const long = "y".repeat(50);
  const lines = ["short one", long, "short three", "z".repeat(40)];

  it("caps every line of a whole-file read, anchors from the full line", async () => {
    const path = fixture(lines);
    const result = await callRead({ path, charLimit: 20 });
    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(text).toContain(`1:${computeLineHash(1, "short one")}|short one\n`);
    expect(text).toContain(`2:${computeLineHash(2, long)}|${"y".repeat(20)}${marker(50, 2, 20, 50)}`);
    expect(text).toContain(`3:${computeLineHash(3, "short three")}|short three\n`);
    expect(text).toContain(`4:${computeLineHash(4, "z".repeat(40))}|${"z".repeat(20)}${marker(40, 4, 20, 40)}`);
    expect("window" in result.details.ptcValue).toBe(false);
    // Display-only: structured lines keep the full content.
    expect(result.details.ptcValue.lines[1].raw).toBe(long);
  });

  it("reads from offset to the end when limit is omitted", async () => {
    const path = fixture(lines);
    const result = await callRead({ path, offset: 2, charLimit: "30" });
    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(text).not.toContain("|short one");
    expect(text).toContain(`|${"y".repeat(30)}${marker(50, 2, 30, 50)}`);
    expect(text).toContain("|short three");
    expect(text).toContain(`|${"z".repeat(30)}${marker(40, 4, 30, 40)}`);
    expect(result.details.ptcValue.range).toEqual({ startLine: 2, endLine: 4, totalLines: 4 });
  });

  it("honours limit across the range", async () => {
    const path = fixture(lines);
    const result = await callRead({ path, offset: 1, limit: 2, charLimit: 10 });
    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(text).toContain(`|short one\n`);
    expect(text).toContain(`|${"y".repeat(10)}${marker(50, 2, 10, 50)}`);
    expect(text).not.toContain("short three");
    expect(text).toContain("Use offset=3 to continue.");
  });

  it("shows a line whole when it fits the cap", async () => {
    const path = fixture(["a".repeat(800)]);
    const result = await callRead({ path, charLimit: 2000 });
    expect(textOf(result)).toContain(`|${"a".repeat(800)}`);
    expect(textOf(result)).not.toContain("[truncated");
  });

  it("names the range form in the default 500-char marker", async () => {
    const path = fixture(["b".repeat(800)]);
    const result = await callRead({ path });
    expect(textOf(result)).toContain(`|${"b".repeat(500)}${marker(800, 1, 500, 800)}`);
  });

  it("clamps the cap to 10,000 and drops the range form once the cap is the maximum", async () => {
    const path = fixture(["c".repeat(12_000), "d".repeat(700)]);
    const result = await callRead({ path, charLimit: 50_000 });
    const text = textOf(result);
    expect(text.startsWith("[Read params adjusted: clamped charLimit 50000 to 10000]")).toBe(true);
    expect(text).toContain(`|${"c".repeat(10_000)}${marker(12_000, 1, 10_000)}`);
    expect(text).toContain(`|${"d".repeat(700)}`);
    // Below the maximum, the range form offers at most 10,000.
    const def = await callRead({ path });
    expect(textOf(def)).toContain(marker(12_000, 1, 500, 10_000));
  });

  it("caps a symbol read; local support, outside the budget, keeps the default cap", async () => {
    const path = fixture([
      `function helper() { return "${"h".repeat(800)}"; }`,
      "",
      "export function beta() {",
      `  return helper() + "${"q".repeat(60)}";`,
      "}",
    ], "f.ts");
    const result = await callRead({ path, symbol: "beta", bundle: "local", charLimit: 25 });
    expect(result.isError).not.toBe(true);
    const text = textOf(result);
    expect(text).toContain("[Symbol: beta (function)");
    expect(text).toContain(`4:${computeLineHash(4, `  return helper() + "${"q".repeat(60)}";`)}|  return helper() + "qqqq... [truncated, 83 chars total; read({offset:4, charOffset:25}) or a range read with charLimit:83]`);
    expect(result.details.ptcValue.bundle?.applied).toBe(true);
    expect(text).toContain(`|function helper() { return "${"h".repeat(472)}... [truncated, 832 chars total; read({offset:1, charOffset:500}) or a range read with charLimit:832]`);
    expect(result.details.contextHygiene.rehydrate).toEqual({
      tool: "read",
      input: { path, symbol: "beta", bundle: "local", charLimit: 25 },
    });
  });

  it("replays a supplied cap through the rehydrate descriptor", async () => {
    const path = fixture(lines);
    const result = await callRead({ path, offset: 2, charLimit: 300 });
    expect(result.details.contextHygiene.rehydrate).toEqual({ tool: "read", input: { path, offset: 2, charLimit: 300 } });
  });

  it("stays inside the 50 KB output budget", async () => {
    const path = fixture(Array.from({ length: 20 }, (_, i) => String(i % 10).repeat(10_000)));
    const result = await callRead({ path, charLimit: 10_000 });
    const text = textOf(result);
    expect(text).toContain("[Output truncated: showing");
    expect(result.details.ptcValue.truncation).not.toBeNull();
    expect(Buffer.byteLength(text, "utf-8")).toBeLessThan(60 * 1024);
  });

  it("keeps charOffset as a one-line window", async () => {
    const path = fixture(lines);
    const result = await callRead({ path, offset: 2, charOffset: 5, charLimit: 10 });
    expect(result.isError).not.toBe(true);
    expect(result.details.ptcValue.window).toMatchObject({ line: 2, charOffset: 5, charLimit: 10, length: 10 });
  });

  it.each([
    ["symbol", { offset: 1, charOffset: 0, symbol: "a" }, "charOffset cannot be combined with symbol"],
    ["limit 2", { offset: 1, limit: 2, charOffset: 0 }, "charOffset addresses exactly one line"],
    ["no offset", { charOffset: 0 }, "charOffset requires a positive offset"],
  ])("still refuses charOffset with %s", async (_name, extra, message) => {
    const path = fixture(lines);
    const result = await callRead({ path, ...extra });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(message);
    expect(result.details.ptcValue.error.code).toBe("invalid-params-combo");
  });
});

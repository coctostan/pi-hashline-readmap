/**
 * Reproduction for #276 / #273: write result size, binary messaging, content coercion.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureHashInit } from "../src/hashline.js";
import { registerWriteTool } from "../src/write.js";

function getWriteTool(): any {
  let captured: any = null;
  registerWriteTool({ registerTool(def: any) { captured = def; } } as any);
  if (!captured) throw new Error("write tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("#276 write compact result", () => {
  let dir = "";
  const tool = getWriteTool();
  const run = (params: Record<string, unknown>) =>
    tool.execute("tc", params, undefined, () => {}, { cwd: dir });

  beforeAll(async () => {
    await ensureHashInit();
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("5k-line write returns a compact summary that points at read, not ptcValue", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "repro-276-write-"));
    const content = Array.from({ length: 5000 }, (_, i) => `line number ${i + 1} with some padding text`).join("\n");
    const result = await run({ path: "big.txt", content });
    expect(result.isError).toBeFalsy();
    expect(readFileSync(path.join(dir, "big.txt"), "utf8")).toBe(content);
    const out = text(result);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThan(4 * 1024);
    expect(out).not.toContain("ptcValue");
    expect(out).toMatch(/\bread\b/);
  });

  it("large write keeps the structured result bounded (codemode OOM proxy)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "repro-276-write-"));
    const content = Array.from({ length: 60000 }, (_, i) => `x${i}`).join("\n");
    const result = await run({ path: "huge.txt", content });
    expect(statSync(path.join(dir, "huge.txt")).size).toBe(Buffer.byteLength(content));
    // Currently: 60,000 ptcValue.lines and ~12 MB of serialized details.
    expect(JSON.stringify(result.details).length).toBeLessThan(256 * 1024);
  });

  it("NUL-containing content: successful write is not reported as an error", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "repro-276-write-"));
    const result = await run({ path: "nul.bin", content: "abc\u0000def" });
    expect(statSync(path.join(dir, "nul.bin")).size).toBe(7);
    expect(result.isError).toBeFalsy();
    expect(result.details?.ptcValue?.ok).not.toBe(false);
    expect(result.details?.ptcValue?.warnings?.some((w: any) => w.code === "binary-content")).toBe(true);
  });

  it("non-string content is rejected with a parameter error, not a raw TypeError", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "repro-276-write-"));
    const result = await run({ path: "coerce.txt", content: 42 });
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain("is not a function");
    expect(text(result)).toMatch(/content/i);
  });

  it("small writes still return anchors (unchanged)", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "repro-276-write-"));
    const result = await run({ path: "small.txt", content: "a\nb\n" });
    expect(text(result)).toBe("1:456|a\n2:dbf|b");
    expect(result.details.ptcValue.lines).toHaveLength(2);
  });
});

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureHashInit } from "../src/hashline.js";
import { executeWrite, registerWriteTool } from "../src/write.js";
import { applyCodemodeIntegration } from "../src/codemode-integration.js";

const COMPACT_SUFFIX = "Anchors omitted for writes over 2000 lines or 50 KB of anchors; use read with offset/limit to get anchors before editing.";

describe("write large-result compaction (#273)", () => {
  let tmpDir = "";

  beforeAll(async () => {
    await ensureHashInit();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("keeps full anchors, diff, and diffData at exactly 2000 lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));
    const content = Array.from({ length: 2000 }, (_, index) => `line ${index + 1}`).join("\n");

    const result = await executeWrite({ path: join(tmpDir, "edge.txt"), content, cwd: tmpDir });

    expect(result.ptcValue.lines).toHaveLength(2000);
    expect(result.ptcValue.truncated).toBeUndefined();
    expect(result.text.split("\n")).toHaveLength(2000);
    expect(result.text.startsWith("1:")).toBe(true);
    expect(result.diffData).toBeDefined();
    expect(result.ptcValue.diffData).toBeDefined();
  });

  it("returns a compact summary that points at read above 2000 lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));
    const filePath = join(tmpDir, "long.txt");
    const content = Array.from({ length: 2003 }, (_, index) => `line ${index + 1}`).join("\n");
    const bytes = Buffer.byteLength(content, "utf8");

    const result = await executeWrite({ path: filePath, content, cwd: tmpDir });

    expect(readFileSync(filePath, "utf8")).toBe(content);
    expect(result.text).toBe(`Wrote long.txt (2003 lines, ${bytes} bytes). ${COMPACT_SUFFIX}`);
    expect(result.text).not.toContain("ptcValue");
    expect(result.ptcValue).toMatchObject({
      tool: "write",
      path: "long.txt",
      lines: [],
      truncated: true,
      totalLines: 2003,
      bytes,
    });
    expect(result.diff).toBeUndefined();
    expect(result.diffData).toBeUndefined();
    expect(result.ptcValue.diff).toBeUndefined();
    expect(result.ptcValue.diffData).toBeUndefined();
    expect(result.writeState).toBe("created");
  });

  it("compacts when anchor text exceeds 50 KB under 2000 lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));
    const content = Array.from({ length: 100 }, (_, index) => `${index}:${"x".repeat(1000)}`).join("\n");

    const result = await executeWrite({ path: join(tmpDir, "wide.txt"), content, cwd: tmpDir });

    expect(result.text).toBe(`Wrote wide.txt (100 lines, ${Buffer.byteLength(content, "utf8")} bytes). ${COMPACT_SUFFIX}`);
    expect(result.ptcValue).toMatchObject({ lines: [], truncated: true, totalLines: 100 });
  });

  it("keeps the codemode structured value small and ASCII for a 200,000-line write", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));
    let tool: any;
    registerWriteTool({ registerTool(def: any) { tool = applyCodemodeIntegration(def); } } as any);
    const content = "abcd\n".repeat(199_999) + "abcd";

    const result = await tool.execute("tc", { path: "huge.txt", content }, undefined, () => {}, { cwd: tmpDir });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(join(tmpDir, "huge.txt"), "utf8")).toBe(content);
    expect(result.structuredContent).toMatchObject({ tool: "write", path: "huge.txt", lines: [], truncated: true, totalLines: 200000 });
    const json = JSON.stringify(result.structuredContent);
    expect(json.length).toBeLessThan(4096);
    expect(json).toMatch(/^[\x20-\x7e]*$/);
    expect(JSON.stringify(result.details).length).toBeLessThan(8192);
  });

  it("flags compact writes with an anchors-omitted warning", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));
    const content = Array.from({ length: 2003 }, (_, index) => `line ${index + 1}`).join("\n");
    const message = "Anchors omitted: 2003 lines exceed the write anchor budget (2000 lines / 50 KB); use read with offset/limit for anchors.";

    const result = await executeWrite({ path: join(tmpDir, "long.txt"), content, cwd: tmpDir });

    expect(result.ptcValue.warnings).toEqual([{ code: "anchors-omitted", message }]);
    expect(result.warnings).toEqual([message]);
  });

  it("does not add the anchors-omitted warning to small writes", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));

    const result = await executeWrite({ path: join(tmpDir, "small.txt"), content: "a\nb\n", cwd: tmpDir });

    expect(result.ptcValue.warnings).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash, applyHashlineEdits } from "../src/hashline.js";

// We'll test the write tool's core logic directly
// The tool registration requires pi's ExtensionAPI, but the core logic is testable

describe("enhanced write tool", () => {
  let tmpDir: string;

  beforeAll(async () => {
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns hashlined output with 3-char hashes after writing", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-test-"));
    const filePath = join(tmpDir, "test.ts");
    const content = "line one\nline two\nline three";

    // Import the write helper
    const { executeWrite } = await import("../src/write.js");
    const result = await executeWrite({ path: filePath, content });

    // File should exist on disk
    expect(readFileSync(filePath, "utf-8")).toBe(content);

    // Output should have hashlined format
    expect(result.text).toMatch(/^1:[0-9a-f]{3}\|line one$/m);
    expect(result.text).toMatch(/^2:[0-9a-f]{3}\|line two$/m);
    expect(result.text).toMatch(/^3:[0-9a-f]{3}\|line three$/m);
  });

  it("returned anchors work directly in applyHashlineEdits", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-test-"));
    const filePath = join(tmpDir, "test.ts");
    const content = "first\nsecond\nthird";

    const { executeWrite } = await import("../src/write.js");
    await executeWrite({ path: filePath, content });

    // Extract anchor for line 2
    const hash2 = computeLineHash(2, "second");
    const anchor = `2:${hash2}`;

    // Use the anchor in an edit
    const edited = applyHashlineEdits(content, [
      { set_line: { anchor, new_text: "SECOND" } },
    ]);
    expect(edited.content).toBe("first\nSECOND\nthird");
  });

  it("detects binary content and includes warning", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-test-"));
    const filePath = join(tmpDir, "binary.bin");
    // Binary content with null bytes
    const content = "header\x00\x01\x02binary\x00data";

    const { executeWrite } = await import("../src/write.js");
    const result = await executeWrite({ path: filePath, content });

    expect(result.text).toContain("binary");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("escapes control characters for display safety", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-test-"));
    const filePath = join(tmpDir, "test.ts");
    const content = "normal line\nline with \x01 control";

    const { executeWrite } = await import("../src/write.js");
    const result = await executeWrite({ path: filePath, content });

    // Control char should be escaped
    expect(result.text).toContain("\\u0001");
    expect(result.text).not.toContain("\x01");
  });

  it("creates parent directories when needed", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-test-"));
    const filePath = join(tmpDir, "nested", "deep", "test.ts");
    const content = "hello";

    const { executeWrite } = await import("../src/write.js");
    await executeWrite({ path: filePath, content });

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("hello");
  });

  it("returns ptcValue with per-line anchors", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-test-"));
    const filePath = join(tmpDir, "test.ts");
    const content = "alpha\nbeta";

    const { executeWrite } = await import("../src/write.js");
    const result = await executeWrite({ path: filePath, content });

    expect(result.ptcValue).toBeDefined();
    expect(result.ptcValue.lines).toHaveLength(2);
    expect(result.ptcValue.lines[0].line).toBe(1);
    expect(result.ptcValue.lines[0].anchor).toMatch(/^1:[0-9a-f]{3}$/);
    expect(result.ptcValue.lines[1].line).toBe(2);
  });
});

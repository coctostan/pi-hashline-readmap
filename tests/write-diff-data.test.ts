import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeWrite, registerWriteTool } from "../src/write.js";

async function callWriteTool(params: Record<string, unknown>) {
  let capturedTool: any;
  registerWriteTool({ registerTool(tool: any) { capturedTool = tool; } } as any);
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("write diff data", () => {
  beforeAll(async () => {
  });

  it("executeWrite returns final diff string parity and diffData", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-write-diff-data-"));
    const filePath = join(dir, "sample.ts");
    writeFileSync(filePath, "const value = 1;\n", "utf-8");

    const result = await executeWrite({ path: filePath, content: "const value = 2;\n" });

    expect(result.diff).toMatch(/^1:[0-9a-f]{3}\|const value = 1; → 1:[0-9a-f]{3}\|const value = 2;$/);
    expect(result.ptcValue.diff).toBe(result.diff);
    expect(result.diffData).toEqual(result.ptcValue.diffData);
    expect(result.diffData!.entries).toEqual([
      { kind: "remove", oldLine: 1, text: "const value = 1;" },
      { kind: "add", newLine: 1, text: "const value = 2;" },
    ]);
  });

  it("represents creating a text file as add-only diff data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-write-create-diff-data-"));
    const filePath = join(dir, "sample.ts");

    const result = await executeWrite({ path: filePath, content: "const value = 1;\n" });

    expect(result.diff).toBe("+1 const value = 1;");
    expect(result.diffData!.entries).toEqual([{ kind: "add", newLine: 1, text: "const value = 1;" }]);
  });

  it("represents overwriting a zero-byte file as add-only diff data", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-write-empty-diff-data-"));
    const filePath = join(dir, "sample.ts");
    writeFileSync(filePath, "", "utf-8");

    const result = await executeWrite({ path: filePath, content: "const value = 1;\n" });

    expect(result.diff).toBe("+1 const value = 1;");
    expect(result.diffData!.entries).toEqual([{ kind: "add", newLine: 1, text: "const value = 1;" }]);
  });

  it("registered write tool exposes diff fields in details", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-write-tool-diff-data-"));
    const filePath = join(dir, "sample.ts");
    writeFileSync(filePath, "const value = 1;\n", "utf-8");

    const result = await callWriteTool({ path: filePath, content: "const value = 2;\n" });

    expect(result.details.diff).toBe(result.details.ptcValue.diff);
    expect(result.details.diffData).toEqual(result.details.ptcValue.diffData);
    expect(result.details.diffData.version).toBe(1);
  });
});

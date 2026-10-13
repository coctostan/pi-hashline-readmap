import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildFileResource } from "../src/context-hygiene.js";
import { executeWrite, registerWriteTool } from "../src/write.js";

async function callWriteTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  registerWriteTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("write tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("write contextHygiene metadata", () => {
  it("executeWrite returns mutation metadata for the written file without changing ptcValue", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-context-hygiene-write-"));
    const filePath = resolve(dir, "sample.ts");

    const result = await executeWrite({ path: filePath, content: "const value = 1;" });

    expect((result as any).contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "write",
      classification: "mutation",
      resources: [buildFileResource(filePath)],
    });
    expect((result.ptcValue as any).contextHygiene).toBeUndefined();
    expect(result.ptcValue).toMatchObject({
      tool: "write",
      path: filePath,
      warnings: [],
    });
    expect(result.text).toMatch(/^1:[0-9a-f]{3}\|const value = 1;$/m);
  });

  it("executeWrite returns mutation metadata for binary writes without changing ptcValue", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-context-hygiene-write-bin-"));
    const filePath = resolve(dir, "sample.bin");

    const result = await executeWrite({ path: filePath, content: "hello\u0000world" });

    expect((result as any).contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "write",
      classification: "mutation",
      resources: [buildFileResource(filePath)],
    });
    expect((result.ptcValue as any).contextHygiene).toBeUndefined();
    expect(result.ptcValue).toMatchObject({
      tool: "write",
      path: filePath,
      lines: [],
    });
    expect(result.ptcValue.warnings.map((warning) => warning.code)).toContain("binary-content");
  });

  it("write tool attaches contextHygiene beside ptcValue for successful and binary writes", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-context-hygiene-write-tool-"));
    const filePath = resolve(dir, "sample.ts");
    const binaryPath = resolve(dir, "sample.bin");

    const result = await callWriteTool({ path: filePath, content: "alpha\nbeta" });
    const binaryResult = await callWriteTool({ path: binaryPath, content: "hello\u0000world" });

    expect(result.details?.contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "write",
      classification: "mutation",
      resources: [buildFileResource(filePath)],
    });
    expect((result.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(result.details?.ptcValue).toMatchObject({
      tool: "write",
      path: relative(process.cwd(), filePath),
      warnings: [],
    });

    expect(binaryResult.details?.contextHygiene).toEqual({
      schemaVersion: 1,
      tool: "write",
      classification: "mutation",
      resources: [buildFileResource(binaryPath)],
    });
    expect((binaryResult.details?.ptcValue as any).contextHygiene).toBeUndefined();
    expect(binaryResult.isError).toBeFalsy();
    expect(binaryResult.details?.ptcValue?.error).toBeUndefined();
    expect(binaryResult.details?.ptcValue?.warnings.map((warning: any) => warning.code)).toContain("binary-content");
  });
});

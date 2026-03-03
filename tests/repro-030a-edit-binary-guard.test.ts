import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { isBinaryBuffer } from "../src/edit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Bug #030a: binary file guard in edit", () => {
  const tmpDir = join(__dirname, ".tmp-030a");
  const binaryFile = join(tmpDir, "binary.bin");
  const textFile = join(tmpDir, "text.txt");

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
    // Binary file with NUL bytes
    const buf = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6c, 0x6f, 0x0a]);
    writeFileSync(binaryFile, buf);
    // Normal text file
    writeFileSync(textFile, "hello\nworld\n");
  });

  afterAll(() => {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {}
  });

  it("isBinaryBuffer returns true for buffer with NUL bytes", () => {
    const binary = Buffer.from([0x48, 0x00, 0x6c]);
    expect(isBinaryBuffer(binary)).toBe(true);
  });

  it("isBinaryBuffer returns false for buffer without NUL bytes", () => {
    const text = Buffer.from([0x48, 0x65, 0x6c]);
    expect(isBinaryBuffer(text)).toBe(false);
  });

  it("edit tool rejects binary file with 'Cannot edit binary file' error", async () => {
    const { registerEditTool } = await import("../src/edit.js");
    const { ensureHashInit } = await import("../src/hashline.js");
    await ensureHashInit();
    let capturedTool: any = null;
    const mockPi = {
      registerTool(def: any) {
        capturedTool = def;
      },
    };
    registerEditTool(mockPi as any);
    if (!capturedTool) throw new Error("edit tool was not registered");

    await expect(
      capturedTool.execute(
        "test-call",
        {
          path: binaryFile,
          edits: [{ set_line: { anchor: "1:00", new_text: "modified" } }],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      ),
    ).rejects.toThrow(/Cannot edit binary file/);
  });
});

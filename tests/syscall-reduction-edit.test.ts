import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit } from "../src/hashline";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { mkdtemp } from "fs/promises";
import path from "path";
import os from "os";

describe("edit.ts syscall reduction", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("edit.ts does not import or use fsAccess", () => {
    const source = readFileSync("src/edit.ts", "utf-8");
    expect(source).not.toContain("fsAccess");
    expect(source).toContain("fsReadFile");
  });

  it("edit.ts does not import constants from fs", () => {
    const source = readFileSync("src/edit.ts", "utf-8");
    expect(source).not.toContain("constants");
  });

  it("source handles ENOENT with 'not found' message", () => {
    const source = readFileSync("src/edit.ts", "utf-8");
    const enoentIdx = source.indexOf('"ENOENT"');
    expect(enoentIdx).toBeGreaterThan(-1);
    const nearbyBlock = source.slice(enoentIdx, enoentIdx + 200).toLowerCase();
    expect(nearbyBlock).toContain("not found");
  });

  it("source handles EISDIR with 'directory' message", () => {
    const source = readFileSync("src/edit.ts", "utf-8");
    const eisdirIdx = source.indexOf('"EISDIR"');
    expect(eisdirIdx).toBeGreaterThan(-1);
    const nearbyBlock = source.slice(eisdirIdx, eisdirIdx + 200).toLowerCase();
    expect(nearbyBlock).toContain("directory");
  });

  it("fsReadFile throws ENOENT for nonexistent path", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "edit-test-"));

    try {
      await readFile(path.join(tmpDir, "nonexistent.txt"));
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("ENOENT");
    }
  });
});

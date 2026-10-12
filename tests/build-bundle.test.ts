import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../scripts/build.mjs";

describe("buildBundle", () => {
  it("writes an ESM bundle with external packages and a commonjs typing file", async () => {
    const outDir = join(mkdtempSync(join(tmpdir(), "bundle-")), "dist");
    await buildBundle({ outDir });

    expect(JSON.parse(readFileSync(join(outDir, "package.json"), "utf8"))).toEqual({ type: "commonjs" });
    const code = readFileSync(join(outDir, "index.js"), "utf8");
    expect(code).toMatch(/^\s*import\s/m);
    expect(code).toMatch(/from\s*["']typebox["']/);
    expect(code).toMatch(/from\s*["']@earendil-works\/pi-coding-agent["']/);
    expect(code).toMatch(/from\s*["']diff["']/);
    expect(code).not.toMatch(/from\s*["']\.{1,2}\//);
    expect(code).toContain("registerReadTool");
  }, 60_000);

  it("leaves no output or staging directory behind when verification fails", async () => {
    const parent = mkdtempSync(join(tmpdir(), "bundle-fail-"));
    const outDir = join(parent, "dist");
    await expect(
      buildBundle({ outDir, verify: () => { throw new Error("forced verification failure"); } }),
    ).rejects.toThrow("forced verification failure");
    expect(existsSync(outDir)).toBe(false);
    expect(readdirSync(parent)).toEqual([]);
  }, 60_000);
});

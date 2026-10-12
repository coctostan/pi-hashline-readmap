import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBuildCli } from "../scripts/build.mjs";

function logger() {
  const warns: string[] = [];
  const errors: string[] = [];
  return { warns, errors, warn: (m: string) => warns.push(m), error: (m: string) => errors.push(m) };
}

describe("runBuildCli", () => {
  it("exits 0 with a warning under --optional when the build fails", async () => {
    const log = logger();
    const code = await runBuildCli(["--optional"], {
      build: async () => { throw new Error("Cannot find package 'esbuild'"); },
      log,
      distDir: join(mkdtempSync(join(tmpdir(), "build-cli-")), "dist"),
    });
    expect(code).toBe(0);
    expect(log.warns).toHaveLength(1);
    expect(log.warns[0]).toContain("Cannot find package 'esbuild'");
    expect(log.warns[0]).toContain("Pi will load index.ts");
    expect(log.errors).toEqual([]);
  });

  it("removes a stale dist/ when an --optional build fails, so Pi really falls back to index.ts", async () => {
    const distDir = join(mkdtempSync(join(tmpdir(), "build-cli-")), "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.js"), "export default function stale() {}\n");
    const code = await runBuildCli(["--optional"], {
      build: async () => { throw new Error("esbuild failed"); },
      log: logger(),
      distDir,
    });
    expect(code).toBe(0);
    expect(existsSync(distDir)).toBe(false);
  });

  it("keeps dist/ when the build succeeds", async () => {
    const distDir = join(mkdtempSync(join(tmpdir(), "build-cli-")), "dist");
    mkdirSync(distDir);
    expect(await runBuildCli(["--optional"], { build: async () => distDir, log: logger(), distDir })).toBe(0);
    expect(existsSync(distDir)).toBe(true);
  });

  it("exits 1 and reports the error without --optional", async () => {
    const log = logger();
    const code = await runBuildCli([], { build: async () => { throw new Error("boom"); }, log });
    expect(code).toBe(1);
    expect(log.errors[0]).toContain("boom");
  });

  it("exits 0 quietly when the build succeeds", async () => {
    const log = logger();
    expect(await runBuildCli(["--optional"], { build: async () => "dist", log })).toBe(0);
    expect(log.warns).toEqual([]);
    expect(log.errors).toEqual([]);
  });

  it("is wired as the package prepare script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.prepare).toBe("node scripts/build.mjs --optional");
  });
});

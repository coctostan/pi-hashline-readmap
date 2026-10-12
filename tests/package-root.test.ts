import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { PACKAGE_ROOT, packageFileUrl, packagePath, resolvePackageRoot } from "../src/package-root.js";

function layout(): string {
  const root = mkdtempSync(join(tmpdir(), "pkg-root-"));
  mkdirSync(join(root, "src/readmap/mappers"), { recursive: true });
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture-pkg" }));
  writeFileSync(join(root, "dist/package.json"), JSON.stringify({ type: "commonjs" }));
  return root;
}

describe("resolvePackageRoot", () => {
  it("resolves src, nested src and dist layouts to the same root (dist/package.json has no name)", () => {
    const root = layout();
    for (const rel of ["src/a.ts", "src/readmap/mappers/b.ts", "dist/index.js"]) {
      expect(resolvePackageRoot(pathToFileURL(join(root, rel)).href), rel).toBe(root);
    }
  });

  it("throws when no named package.json exists above the file", () => {
    const lone = mkdtempSync(join(tmpdir(), "no-pkg-"));
    expect(() => resolvePackageRoot(pathToFileURL(join(lone, "x.js")).href)).toThrow("Could not locate package root");
  });
});

describe("package-root exports", () => {
  it("point at this checkout and its shipped assets", () => {
    expect(PACKAGE_ROOT).toBe(realpathSync(process.cwd()));
    expect(existsSync(packagePath("prompts", "read.md"))).toBe(true);
    expect(existsSync(packagePath("scripts", "python_outline.py"))).toBe(true);
    expect(packageFileUrl("prompts", "read.md").protocol).toBe("file:");
    expect(packageFileUrl("prompts", "read.md").pathname.endsWith("/prompts/read.md")).toBe(true);
  });
});

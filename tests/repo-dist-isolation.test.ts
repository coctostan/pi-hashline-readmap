import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A repo-level dist/ (from `npm ci`/`npm install` running `prepare`, or `npm run build`) must neither be
// created by the test suite nor change what the host-compatibility harnesses load (#267).
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "fixtures" ? [] : walk(path);
    return /\.(ts|mts|mjs)$/.test(entry.name) ? [path] : [];
  });
}
const testFiles = walk("tests");

describe("repo dist/ isolation", () => {
  it("never runs npm pack with lifecycle scripts (prepare would build the repo's dist/)", () => {
    const offenders = testFiles.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, index) => ({ line, at: `${file}:${index + 1}` }))
        .filter(({ line }) => /\[\s*"pack"/.test(line) && !line.includes('"--ignore-scripts"'))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });

  it("host harnesses load this checkout's index.ts explicitly, not the package manifest", () => {
    for (const file of ["tests/pi-host-null-pipeline.test.ts", "tests/helpers/selected-host-codemode.mjs"]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("discoverAndLoadExtensions([process.cwd()]");
      expect(text, file).toMatch(/discoverAndLoadExtensions\(\[\s*resolve\(process\.cwd\(\), "index\.ts"\)\s*\]/);
    }
  });
});

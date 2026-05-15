/**
 * SEC-001 static guard (P1-A6).
 *
 * Fails the test suite if any file in `src/readmap/mappers/` reintroduces
 * a vulnerable shell-string subprocess pattern containing an untrusted
 * path-like variable (e.g. `${filePath}`, `${file}`, `${path}` inside a
 * template literal passed to `exec(...)`, `execSync(...)`, `spawn(...)`
 * with `shell: true`, or `child_process.exec` directly).
 *
 * Allowed patterns:
 *   - `execFile(...)`, `execFileSync(...)`, `execFileSafe(...)`
 *   - `spawn(...)` without `{ shell: true }`
 *   - `exec(...)` with a string argument that contains NO `${...}`
 *     template interpolation (static commands like `"go version"` are
 *     fine for AVAIL classification but discouraged for new code).
 *
 * Reintroduction test: see `tests/sec-001-static-guard-fixture.txt`
 * for a seeded vulnerable pattern that this guard MUST flag when
 * temporarily copied into a mapper file. The guard is verified against
 * an inline fake fixture below.
 */

import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPPERS_DIR = resolve(__dirname, "..", "src/readmap/mappers");

/**
 * Detects calls of the form:
 *   exec(`...${filePath}...`, ...)
 *   exec("..." + filePath + "...", ...)
 *   execSync(`...${path}...`)
 *   spawn(..., { shell: true })
 *
 * This is a regex-based heuristic, not a full AST scan. Documented as
 * such in CRITERIA.md (false positives require manual review).
 */
function scanFile(content: string): string[] {
  const issues: string[] = [];

  // 1. Template-literal exec/execSync with path-like interpolation.
  //    Catches:  exec(`... ${filePath} ...`)
  //    Catches:  exec(`... ${path} ...`)
  //    Catches:  exec(`... ${file} ...`)
  //    Catches:  execSync(`... ${anyPathVar} ...`)
  const templateLiteralCall = /\b(?:exec|execSync|execAsync)\s*\(\s*`[^`]*\$\{[^}]*(?:filePath|file|path|target|input|name)[^}]*\}[^`]*`/gi;
  for (const match of content.matchAll(templateLiteralCall)) {
    issues.push(`shell-template exec(): ${match[0].slice(0, 120)}`);
  }

  // 2. String-concatenation exec/execSync involving a path-like identifier.
  const concatCall = /\b(?:exec|execSync|execAsync)\s*\(\s*["'][^"']*["']\s*\+\s*(?:filePath|file|path)/gi;
  for (const match of content.matchAll(concatCall)) {
    issues.push(`string-concat exec(): ${match[0].slice(0, 120)}`);
  }

  // 3. spawn(...) with shell: true.
  const spawnShell = /\bspawn\s*\([^)]*shell\s*:\s*true/g;
  for (const match of content.matchAll(spawnShell)) {
    issues.push(`spawn with shell: true: ${match[0].slice(0, 120)}`);
  }

  return issues;
}

describe("SEC-001 static guard: mapper subprocess pattern (P1-A6)", () => {
  it("no mapper file invokes exec()/execSync()/spawn(shell:true) with an interpolated path", async () => {
    const entries = await readdir(MAPPERS_DIR);
    const mapperFiles = entries.filter(
      (n) => n.endsWith(".ts") && !n.endsWith(".d.ts")
    );

    const violations: { file: string; issues: string[] }[] = [];
    for (const f of mapperFiles) {
      const text = await readFile(join(MAPPERS_DIR, f), "utf8");
      const issues = scanFile(text);
      if (issues.length > 0) {
        violations.push({ file: f, issues });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map(
          (v) =>
            `\n  ${v.file}:\n    ${v.issues.join("\n    ")}`
        )
        .join("");
      throw new Error(
        `SEC-001 static guard: vulnerable mapper subprocess patterns detected.${report}\n` +
          `\nUse execFileSafe(cmd, [...args]) from ./_subprocess-utils.js instead, ` +
          `or replace with a native helper (see docs/security/SEC-001-mapper-subprocess-ledger.md).`
      );
    }

    expect(violations).toEqual([]);
  });

  it("guard FAILS on a seeded vulnerable fixture (reintroduction proof)", () => {
    const fakeVulnerableFile = `
      import { exec } from "node:child_process";
      import { promisify } from "node:util";
      const execAsync = promisify(exec);
      export async function evilMapper(filePath: string) {
        return await execAsync(\`wc -l < "\${filePath}"\`);
      }
    `;
    const issues = scanFile(fakeVulnerableFile);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatch(/shell-template exec/);
  });

  it("guard does NOT flag the safe argv pattern", () => {
    const safeFile = `
      import { execFileSafe } from "./_subprocess-utils.js";
      export async function safeMapper(filePath: string) {
        return await execFileSafe("wc", ["-l", filePath], { timeout: 5000 });
      }
    `;
    const issues = scanFile(safeFile);
    expect(issues).toEqual([]);
  });

  it("guard does NOT flag a static exec() with no interpolation", () => {
    const staticFile = `
      import { exec } from "node:child_process";
      import { promisify } from "node:util";
      const execAsync = promisify(exec);
      export async function probe() {
        return await execAsync("ctags --version");
      }
    `;
    const issues = scanFile(staticFile);
    expect(issues).toEqual([]);
  });
});

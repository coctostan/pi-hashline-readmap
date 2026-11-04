import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { host } from "./helpers/codemode-recipes.js";

it("a 5000-line bash result is Pi's own last 2000 lines, with no preview or temp file of ours", () => {
  // A fresh TMPDIR holds every temp file this run writes, Pi's and ours.
  const scratchTmp = mkdtempSync(join(tmpdir(), "hashline-large-bash-"));
  try {
    const stdout = execFileSync(process.execPath, [resolve("tests/helpers/selected-host-codemode.mjs"), host], {
      cwd: process.cwd(), encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, TMPDIR: scratchTmp, PI_CODEMODE_CASE: 'text("case=PASS");', PI_CODEMODE_BASH_LARGE: "1" },
    });
    const { largeBash } = JSON.parse(stdout.trim().split("\n").at(-1)!);
    const fullOutputPath: string = largeBash.details.fullOutputPath;

    expect(largeBash.text).toBe(largeBash.piText);
    expect(largeBash.text.startsWith("3001\n3002\n")).toBe(true);
    expect(largeBash.text.endsWith(`\n5000\n\n[Showing lines 3001-5000 of 5000. Full output: ${fullOutputPath}]`)).toBe(true);
    expect(largeBash.text).not.toContain("[Bash context guard");
    expect(Object.keys(largeBash.details).sort()).toEqual(["contextHygiene", "fullOutputPath", "truncation"]);

    expect(fullOutputPath.startsWith(scratchTmp)).toBe(true);
    expect(readFileSync(fullOutputPath, "utf8").split("\n").filter(Boolean)).toHaveLength(5000);
    expect(readdirSync(scratchTmp).filter((name) => name.startsWith("hashline-bash-"))).toEqual([]);
  } finally {
    rmSync(scratchTmp, { recursive: true, force: true });
  }
}, 130_000);

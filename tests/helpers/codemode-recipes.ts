import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { selectCompatHost } from "../../scripts/pi-compat-host.mjs";

export const { host, version } = selectCompatHost();
export const supported = existsSync(join(host, "dist/extensions/codemode/execute.js"));
if (process.env.PI_COMPAT_HOST && !supported) {
  throw new Error("Explicit compatibility host has no codemode executor");
}
export interface RecipeProgram {
  files?: Record<string, string>;
  inspect?: string[];
  mode?: "on" | "only";
  persist?: boolean;
  normalWorkflow?: "independent" | "search-edit";
  steps: Array<{
    code?: string;
    checkpoint?: string;
    branch?: string;
    resume?: boolean;
  }>;
}
export function runProgram(program: RecipeProgram, env: Record<string, string> = {}): any {
  const stdout = execFileSync(process.execPath, [resolve("tests/helpers/selected-host-codemode.mjs"), host], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env, PI_CODEMODE_CASE: 'text("case=PASS");',
      PI_HASHLINE_BASH_CONTEXT_GUARD: "0", PI_CODEMODE_PROGRAM: JSON.stringify(program), ...env,
    },
  });
  const value = JSON.parse(stdout.trim().split("\n").at(-1)!);
  assert.ok(value.program, "Selected host did not run recipe program");
  return value;
}
export function recipe(id: string): string {
  const path = "docs/codemode-recipes.md";
  const doc = existsSync(path) ? readFileSync(path, "utf8") : "";
  const start = "<!-- recipe:" + id + " -->";
  const end = "<!-- /recipe:" + id + " -->";
  const section = doc.split(start)[1]?.split(end)[0];
  const code = section?.match(/~~~js\n([\s\S]*?)\n~~~/)?.[1];
  if (!code) throw new Error("Missing recipe: " + id);
  return code;
}
/**
 * Prepends seed statements to a recipe while keeping a leading `// @options:` line first.
 * The selected host rejects an options line that is not the first line of the script.
 */
export function seeded(seed: string, code: string): string {
  const statements = seed.endsWith("\n") ? seed : seed + "\n";
  if (!code.startsWith("// @options:")) return statements + code;
  const newline = code.indexOf("\n");
  if (newline < 0) return code + "\n" + statements;
  return code.slice(0, newline + 1) + statements + code.slice(newline + 1);
}
export function jsonOf(report: any, index = 0): any {
  const result = report.results[index];
  assert.ok(!result.failed, result.text);
  const line = result.text.split("\n").find((line: string) => /^[\[{]/.test(line));
  assert.ok(line, "Recipe emitted no JSON summary");
  return JSON.parse(line);
}

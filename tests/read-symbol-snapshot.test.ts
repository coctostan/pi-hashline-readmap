import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const race = vi.hoisted(() => ({
  replacement: undefined as string | undefined,
  originalPath: "",
  during: false,
  restore: undefined as string | undefined,
  staged: [] as string[],
}));
vi.mock("../src/map-cache.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/map-cache.js")>();
  return {
    ...actual,
    async getOrGenerateMap(path: string, ...args: unknown[]) {
      race.originalPath = path;
      if (race.replacement !== undefined && !race.during) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(path, race.replacement);
        race.replacement = undefined;
      }
      return Reflect.apply(actual.getOrGenerateMap, actual, [path, ...args]);
    },
  };
});
vi.mock("../src/readmap/mapper.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/readmap/mapper.js")>();
  return {
    ...actual,
    async generateMapWithIdentity(path: string, options?: any) {
      if (path !== race.originalPath) race.staged.push(path);
      const { writeFile } = await import("node:fs/promises");
      if (race.during && race.replacement !== undefined) {
        await writeFile(race.originalPath, race.replacement);
        race.replacement = undefined;
      }
      const result = await actual.generateMapWithIdentity(path, options);
      if (race.restore !== undefined) {
        await writeFile(race.originalPath, race.restore);
        race.restore = undefined;
      }
      return result;
    },
  };
});
import { registerReadTool } from "../src/read.js";
import { withCodemodeIntegration } from "../src/codemode-integration.js";
import { computeLineHash } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";

const dirs: string[] = [];
afterEach(() => {
  race.replacement = undefined;
  race.restore = undefined;
  race.during = false;
  race.staged = [];
  clearMapCache();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const short = "export function target() { return 'short'; }\n";
const long = "// padding\n".repeat(80) + "export function target() { return 'long'; }\n";
const sameA = "export function target() { return 1; }\nexport function decoyx() { return 2; }\n";
const sameB = "export function decoyx() { return 2; }\nexport function target() { return 1; }\n";
function harness(content: string, fileName = "source.ts") {
  const cwd = mkdtempSync(join(tmpdir(), "read-symbol-snapshot-"));
  dirs.push(cwd);
  const path = join(cwd, fileName);
  writeFileSync(path, content);
  let tool: any;
  registerReadTool(withCodemodeIntegration({ registerTool(t: any) { tool = t; } } as any));
  return { path, call: (strictSymbol: boolean) => tool.execute("snapshot", {
    path: fileName, symbol: "target", ...(strictSymbol ? { strictSymbol: true } : {}),
  }, undefined, undefined, { cwd }) };
}

it.each([
  ["growing file", short, long, "source.ts"],
  ["shrinking file", long, short, "source.ts"],
  ["equal size", sameA, sameB, "source.ts"],
  ["BOM CRLF", "\uFEFF" + short.replace(/\n/g, "\r\n"), long, "source.ts"],
  ["shell", "target() { echo old; }\n", "# padding\n".repeat(80) + "target() { echo new; }\n", "source.sh"],
  ["fallback", "function target() {}\n", "// padding\n".repeat(80) + "function target() {}\n", "source.unrecognized263"],
])("returns the captured symbol snapshot: %s", async (_name, before, after, fileName) => {
  for (const strict of [false, true]) {
    for (const timing of ["before-map", "during-map", "aba"]) {
      const { path, call } = harness(before, fileName);
      race.replacement = after;
      race.during = timing !== "before-map";
      race.restore = timing === "aba" ? before : undefined;
      const result = await call(strict);
      expect(result.isError).not.toBe(true);
      const r = result.structuredContent;
      expect(r.range.startLine).toBeLessThanOrEqual(r.range.endLine);
      expect(r.lines.some((l: any) => l.raw.includes("target"))).toBe(true);
      const normalized = before.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
      const lines = normalized.split("\n");
      if (lines.at(-1) === "") lines.pop();
      expect(r.path).toBe(path);
      expect(r.range.totalLines).toBe(lines.length);
      const targetLine = lines.findIndex(line => line.includes("target")) + 1;
      expect(r.symbol.startLine).toBe(targetLine);
      expect(r.lines.map((l: any) => l.raw)).toEqual(lines.slice(r.range.startLine - 1, r.range.endLine));
      for (const line of r.lines) expect(line.anchor).toBe(`${line.line}:${computeLineHash(line.line, line.raw)}`);
      for (const staged of race.staged.splice(0)) expect(existsSync(dirname(staged))).toBe(false);
    }
  }
}, 30000);

it.each([false, true])("keeps sequential symbol reads valid (strict=%s)", async strict => {
  for (const content of [short, long]) {
    const result = await harness(content).call(strict);
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.lines.some((l: any) => l.raw.includes("function target"))).toBe(true);
  }
});

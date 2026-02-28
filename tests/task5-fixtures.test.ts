import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const fixturesDir = resolve(root, "tests/fixtures");

describe("task 5 fixture files", () => {
  it("creates all required fixture files", () => {
    const required = [
      "small.ts",
      "large.ts",
      "small.py",
      "sample.bin",
      "plain.txt",
    ];

    for (const file of required) {
      expect(existsSync(resolve(fixturesDir, file))).toBe(true);
    }
  });

  it("small.ts is ~50 lines and includes exactly one interface/class/function shape", () => {
    const source = readFileSync(resolve(fixturesDir, "small.ts"), "utf8");
    const lines = source.trimEnd().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(49);
    expect(lines.length).toBeLessThanOrEqual(70);
    const interfaces = source.match(/\binterface\s+\w+/g) ?? [];
    const classes = source.match(/^export class\s+\w+/gm) ?? [];
    const constructors = source.match(/\bconstructor\s*\(/g) ?? [];
    const classMethods =
      source.match(/^\s{2}(?!constructor\b)\w+\s*\([^)]*\)\s*:\s*[^\n{]+\{/gm) ?? [];
    const exportedFunctions = source.match(/^export function\s+\w+\s*\(/gm) ?? [];

    expect(interfaces).toHaveLength(1);
    expect(classes).toHaveLength(1);
    expect(constructors).toHaveLength(1);
    expect(classMethods).toHaveLength(2);
    expect(exportedFunctions).toHaveLength(1);
  });

  it("large.ts is >2000 lines and includes varied TypeScript symbols", () => {
    const source = readFileSync(resolve(fixturesDir, "large.ts"), "utf8");
    const lines = source.trimEnd().split("\n");

    expect(lines.length).toBeGreaterThan(2000);
    expect(source).toMatch(/\benum\b/);
    expect(source).toMatch(/\binterface\b/);
    expect(source).toMatch(/\btype\b/);
    expect(source).toMatch(/\bclass\b/);
    expect(source).toMatch(/\bfunction\b/);
  });

  it("small.py is ~30 lines and includes one class/__init__/method/function", () => {
    const source = readFileSync(resolve(fixturesDir, "small.py"), "utf8");
    const lines = source.trimEnd().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(28);
    expect(lines.length).toBeLessThanOrEqual(40);
    const classes = source.match(/^class\s+\w+/gm) ?? [];
    const inits = source.match(/^\s{4}def __init__\s*\(/gm) ?? [];
    const classMethods = source.match(/^\s{4}def (?!__init__)\w+\s*\(/gm) ?? [];
    const standaloneFunctions = source.match(/^def\s+\w+\s*\(/gm) ?? [];

    expect(classes).toHaveLength(1);
    expect(inits).toHaveLength(1);
    expect(classMethods).toHaveLength(1);
    expect(standaloneFunctions).toHaveLength(1);
  });

  it("sample.bin is 16 bytes and not valid UTF-8", () => {
    const bytes = readFileSync(resolve(fixturesDir, "sample.bin"));

    expect(bytes.length).toBe(16);

    const decoder = new TextDecoder("utf-8", { fatal: true });
    expect(() => decoder.decode(bytes)).toThrow();
  });

  it("plain.txt is ~20 lines of plain text", () => {
    const source = readFileSync(resolve(fixturesDir, "plain.txt"), "utf8");
    const lines = source.trimEnd().split("\n");

    expect(lines.length).toBeGreaterThanOrEqual(22);
    expect(lines.length).toBeLessThanOrEqual(30);
    expect(source.toLowerCase()).toContain("lorem ipsum");
    expect(source).not.toMatch(/\b(class|interface|enum|type)\b/);
  });
});

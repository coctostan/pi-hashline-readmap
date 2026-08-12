import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function executeBody(source: string): string {
  const start = source.indexOf("async execute(");
  const end = source.indexOf("\n\t\trenderCall(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("edit persistence phases", () => {
  it("extracts syntax validation before atomic persistence and optional verification", () => {
    const source = readFileSync("src/edit.ts", "utf8");
    const execute = executeBody(source);
    expect(source).toMatch(/async function validateEditSyntax\s*\(/);
    expect(source).toMatch(/async function finalizeWrite\s*\(/);
    const syntaxIndex = execute.indexOf("await validateEditSyntax({");
    const writeIndex = execute.indexOf("await finalizeWrite({");
    expect([syntaxIndex, writeIndex].every((index) => index >= 0)).toBe(true);
    expect(syntaxIndex).toBeLessThan(writeIndex);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function executeBody(source: string): string {
  const start = source.indexOf("async execute(");
  const end = source.indexOf("\n\t\trenderCall(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("edit application phases", () => {
  it("extracts anchored application, replacement application, and no-op detection in order", () => {
    const source = readFileSync("src/edit.ts", "utf8");
    const execute = executeBody(source);
    expect(source).toMatch(/function applyAnchorEdits\s*\(/);
    expect(source).toMatch(/function applyReplaceEdits\s*\(/);
    expect(source).toMatch(/function detectNoop\s*\(/);
    const anchorsIndex = execute.indexOf("applyAnchorEdits({");
    const replacementsIndex = execute.indexOf("applyReplaceEdits({");
    const noopIndex = execute.indexOf("detectNoop({");
    expect([anchorsIndex, replacementsIndex, noopIndex].every((index) => index >= 0)).toBe(true);
    expect(anchorsIndex).toBeLessThan(replacementsIndex);
    expect(replacementsIndex).toBeLessThan(noopIndex);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function editSource(): string {
  return readFileSync("src/edit.ts", "utf8");
}

function executeBody(source: string): string {
  const start = source.indexOf("async execute(");
  const end = source.indexOf("\n\t\trenderCall(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("edit.execute named phases", () => {
  it("extracts typed input-validation and source-loading phases", () => {
    const source = editSource();
    const execute = executeBody(source);
    expect(source).toMatch(/function validateEdits\s*\(/);
    expect(source).toMatch(/async function loadEditSource\s*\(/);
    expect(source).toContain("type EditPhaseResult<T>");
    expect(execute).toContain("validateEdits({");
    expect(execute).toContain("await loadEditSource({");
    expect(execute.indexOf("validateEdits({")).toBeLessThan(execute.indexOf("await loadEditSource({"));
  });

  it("extracts replace-symbol resolution, overlap validation, and application in precedence order", () => {
    const source = editSource();
    const execute = executeBody(source);
    expect(source).toMatch(/async function resolveReplaceSymbols\s*\(/);
    expect(source).toMatch(/function validateReplaceSymbolOverlaps\s*\(/);
    expect(source).toMatch(/function applyResolvedReplaceSymbols\s*\(/);
    const resolveIndex = execute.indexOf("await resolveReplaceSymbols({");
    const overlapIndex = execute.indexOf("validateReplaceSymbolOverlaps({");
    const applyIndex = execute.indexOf("applyResolvedReplaceSymbols(");
    expect([resolveIndex, overlapIndex, applyIndex].every((index) => index >= 0)).toBe(true);
    expect(resolveIndex).toBeLessThan(overlapIndex);
    expect(overlapIndex).toBeLessThan(applyIndex);
  });
});

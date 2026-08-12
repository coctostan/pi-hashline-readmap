import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function executeBody(source: string): string {
  const start = source.indexOf("async execute(");
  const end = source.indexOf("\n\t\trenderCall(", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("edit execute orchestration", () => {
  it("builds the result in a named phase and keeps execute queue-scoped", () => {
    const source = readFileSync("src/edit.ts", "utf8");
    const execute = executeBody(source);
    expect(source).toMatch(/async function buildEditResult\s*\(/);
    expect(execute).toContain("await buildEditResult({");
    expect(execute).not.toContain("replaceSymbol({");
    expect(execute).not.toContain("applyHashlineEdits(");
    expect(execute).not.toContain("replaceText(");
    expect(execute).not.toContain("writeFileAtomically(");
    expect(execute).not.toContain("buildEditOutput({");
    expect(execute.split("\n").length).toBeLessThan(160);

    const queueStart = execute.indexOf("return await withFileMutationQueue(queueKey, async () => {");
    const queueEnd = execute.indexOf("\n\t\t\t\t});", queueStart);
    expect(queueStart).toBeGreaterThan(-1);
    expect(queueEnd).toBeGreaterThan(queueStart);
    const callbackLines = execute.slice(queueStart, queueEnd).split("\n").slice(1).filter((line) => line.trim());
    expect(callbackLines.every((line) => line.startsWith("\t\t\t\t\t"))).toBe(true);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { ensureHashInit } from "../src/hashline.js";
import { buildReadSourceOutput } from "../src/read-output.js";

function makeLine(index: number, width: number): string {
  const prefix = `export const value${String(index).padStart(4, "0")} = "`;
  const suffix = `";`;
  return `${prefix}${"x".repeat(width - prefix.length - suffix.length)}${suffix}`;
}

const cases: Array<{
  name: string;
  selectedLines: string[];
  expectedOutputLines: number;
  expectedTruncatedBy: "bytes" | "lines";
}> = [
  {
    name: "byte budget with 800-character rows capped for display",
    selectedLines: Array.from({ length: 200 }, (_, index) => makeLine(index + 1, 800)),
    expectedOutputLines: 94,
    expectedTruncatedBy: "bytes",
  },
  {
    name: "byte budget with uncapped 400-character rows",
    selectedLines: Array.from({ length: 200 }, (_, index) => makeLine(index + 1, 400)),
    expectedOutputLines: 125,
    expectedTruncatedBy: "bytes",
  },
  {
    name: "line budget with one capped row and 2,000 short rows",
    selectedLines: [makeLine(1, 800), ...Array.from({ length: 2_000 }, () => "")],
    expectedOutputLines: 2_000,
    expectedTruncatedBy: "lines",
  },
  {
    name: "line budget with 2,001 uncapped short rows",
    selectedLines: Array.from({ length: 2_001 }, () => ""),
    expectedOutputLines: 2_000,
    expectedTruncatedBy: "lines",
  },
];

describe("buildReadSourceOutput global budget boundaries", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it.each(cases)("keeps only complete displayed rows at the $name", ({
    selectedLines,
    expectedOutputLines,
    expectedTruncatedBy,
  }) => {
    const startLine = 41;
    const source = buildReadSourceOutput({
      startLine,
      totalLines: selectedLines.length + 100,
      selectedLines,
    });
    const displayedRows = source.text.match(/^\d+:[0-9a-f]{3}\|/gm)?.length ?? 0;

    expect({
      displayedRows,
      budgetOutputLines: source.budget.outputLines,
      truncatedBy: source.budget.truncatedBy,
      projectedOutputLines: source.truncation?.outputLines,
      projectedTotalLines: source.truncation?.totalLines,
    }).toEqual({
      displayedRows: expectedOutputLines,
      budgetOutputLines: expectedOutputLines,
      truncatedBy: expectedTruncatedBy,
      projectedOutputLines: expectedOutputLines,
      projectedTotalLines: selectedLines.length + 100,
    });
    expect(source.text).toBe(source.budget.content);
    expect(source.lines).toHaveLength(selectedLines.length);
    expect(source.lines[0].line).toBe(startLine);
    expect(source.lines.at(-1)?.raw).toBe(selectedLines.at(-1));
    expect(Buffer.byteLength(source.text, "utf8")).toBeLessThanOrEqual(50 * 1024);
  });
});

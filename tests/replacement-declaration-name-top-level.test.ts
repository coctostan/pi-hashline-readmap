import { expect, it } from "vitest";
import { replaceSymbol } from "../src/replace-symbol.js";

interface TopLevelCase {
  label: string;
  filePath: string;
  content: string;
  symbol: string;
  newBody: string;
  warnings: string[];
}

const cases: TopLevelCase[] = [
  {
    label: "TypeScript top-level class genuine mismatch",
    filePath: "processor.ts",
    content: "export class Processor {}",
    symbol: "Processor",
    newBody: "export class Different {}",
    warnings: ["name-mismatch: expected Processor, got Different"],
  },
  {
    label: "JavaScript top-level function genuine mismatch",
    filePath: "processor.js",
    content: "export function process(value) { return value; }",
    symbol: "process",
    newBody: "export function different(value) { return value; }",
    warnings: ["name-mismatch: expected process, got different"],
  },
  {
    label: "Rust top-level struct genuine mismatch",
    filePath: "processor.rs",
    content: "struct Processor;",
    symbol: "Processor",
    newBody: "struct Different;",
    warnings: ["name-mismatch: expected Processor, got Different"],
  },
  {
    label: "Rust top-level function genuine mismatch",
    filePath: "processor.rs",
    content: "fn process() {}",
    symbol: "process",
    newBody: "fn different() {}",
    warnings: ["name-mismatch: expected process, got different"],
  },
  {
    label: "Java top-level class genuine mismatch",
    filePath: "Processor.java",
    content: "class Processor {}",
    symbol: "Processor",
    newBody: "class Different {}",
    warnings: ["name-mismatch: expected Processor, got Different"],
  },
];

it("uses the outer top-level declaration name for non-member replacements", async () => {
  for (const testCase of cases) {
    const result = await replaceSymbol({
      filePath: testCase.filePath,
      content: testCase.content,
      symbol: testCase.symbol,
      newBody: testCase.newBody,
    });
    expect(result.type, testCase.label).toBe("ok");
    if (result.type !== "ok") throw new Error(`${testCase.label}: ${result.message}`);
    expect(result.warnings, testCase.label).toEqual(testCase.warnings);
  }
});

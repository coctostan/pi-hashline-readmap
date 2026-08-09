import { expect, it } from "vitest";
import { replaceSymbol } from "../src/replace-symbol.js";

interface MemberCase {
  label: string;
  filePath: string;
  content: string;
  symbol: string;
  newBody: string;
  warnings: string[];
}

const cases: MemberCase[] = [
  {
    label: "JavaScript method ignores nested const",
    filePath: "processor.js",
    content: [
      "class Processor {",
      "  process(value) {",
      "    return value;",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody: "process(value) {\n  const normalized = value.trim();\n  return normalized;\n}",
    warnings: [],
  },
  {
    label: "TypeScript decorated static async generic method ignores nested const",
    filePath: "processor.ts",
    content: [
      "class Processor {",
      "  process<T>(value: T): T {",
      "    return value;",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody:
      "@trace()\nstatic async process<T>(value: T): Promise<T> {\n  const normalized = value;\n  return normalized;\n}",
    warnings: [],
  },
  {
    label: "TypeScript generic method genuine mismatch",
    filePath: "processor.ts",
    content: [
      "class Processor {",
      "  process<T>(value: T): T {",
      "    return value;",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody: "different<T>(value: T): T { return value; }",
    warnings: ["name-mismatch: expected process, got different"],
  },
  {
    label: "TypeScript @line member query keeps the expected leaf",
    filePath: "processor.ts",
    content: [
      "class Processor {",
      "  process(value: string): string { return value; }",
      "}",
    ].join("\n"),
    symbol: "Processor.process@2",
    newBody: "process(value: string): string { return value.trim(); }",
    warnings: [],
  },
  {
    label: "TypeScript getter ignores nested const",
    filePath: "processor.ts",
    content: [
      "class Processor {",
      "  get value(): string {",
      "    return '';",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.value",
    newBody: "get value(): string {\n  const normalized = 'ok';\n  return normalized;\n}",
    warnings: [],
  },
  {
    label: "TypeScript setter genuine mismatch",
    filePath: "processor.ts",
    content: [
      "class Processor {",
      "  set value(next: string) {",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.value",
    newBody: "set different(next: string) {}",
    warnings: ["name-mismatch: expected value, got different"],
  },
  {
    label: "TypeScript constructor ignores nested const",
    filePath: "processor.ts",
    content: [
      "class Processor {",
      "  constructor(value: string) {",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.constructor",
    newBody: "constructor(value: string) {\n  const normalized = value.trim();\n}",
    warnings: [],
  },
  {
    label: "JavaScript static getter genuine mismatch",
    filePath: "processor.js",
    content: [
      "class Processor {",
      "  static get value() {",
      "    return '';",
      "  }",
      "}",
    ].join("\n"),
    symbol: "Processor.value",
    newBody: "static get different() { return ''; }",
    warnings: ["name-mismatch: expected value, got different"],
  },
  {
    label: "Rust async method ignores nested let",
    filePath: "processor.rs",
    content: [
      "struct Processor;",
      "impl Processor {",
      "    async fn process(&self, value: String) -> String {",
      "        value",
      "    }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody: "async fn process(&self, value: String) -> String {\n  let normalized = value;\n  normalized\n}",
    warnings: [],
  },
  {
    label: "Rust attributed generic method genuine mismatch",
    filePath: "processor.rs",
    content: [
      "struct Processor;",
      "impl Processor {",
      "    fn process<T>(&self, value: T) -> T {",
      "        value",
      "    }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody: "#[inline]\nfn different<T>(&self, value: T) -> T { value }",
    warnings: ["name-mismatch: expected process, got different"],
  },
  {
    label: "Java annotated static generic method ignores nested var",
    filePath: "Processor.java",
    content: [
      "class Processor {",
      "    Object process(Object value) {",
      "        return value;",
      "    }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody:
      "@Deprecated\npublic static <T> T process(T value) {\n  var normalized = value;\n  return normalized;\n}",
    warnings: [],
  },
  {
    label: "Java annotated generic method genuine mismatch",
    filePath: "Processor.java",
    content: [
      "class Processor {",
      "    Object process(Object value) {",
      "        return value;",
      "    }",
      "}",
    ].join("\n"),
    symbol: "Processor.process",
    newBody: "@Deprecated\npublic <T> T different(T value) { return value; }",
    warnings: ["name-mismatch: expected process, got different"],
  },
  {
    label: "Java constructor ignores nested var",
    filePath: "Processor.java",
    content: [
      "class Processor {",
      "    Processor(String value) {",
      "    }",
      "}",
    ].join("\n"),
    symbol: "Processor.Processor",
    newBody: "Processor(String value) {\n  var normalized = value.trim();\n}",
    warnings: [],
  },
];

it("uses the outer member declaration name for standalone member replacements", async () => {
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

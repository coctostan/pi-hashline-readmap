import { expect, it } from "vitest";
import { fallbackDeclarationName } from "../src/replacement-declaration-name.js";

interface HeaderCase {
  label: string;
  newBody: string;
  expected: string | undefined;
}

const cases: HeaderCase[] = [
  {
    label: "TypeScript decorated generic member header",
    newBody: "@trace()\nprocess<T>(value: T): T {\n  const normalized = value;\n  return normalized;\n}",
    expected: "process",
  },
  {
    label: "Java annotated generic member header",
    newBody: "@Deprecated\npublic <T> T different(T value) {\n  var normalized = value;\n}",
    expected: "different",
  },
  {
    label: "Rust attributed generic function header",
    newBody: "#[inline]\nfn process<T>(&self, value: T) -> T { value }",
    expected: "process",
  },
  {
    label: "TypeScript top-level declaration header",
    newBody: "export class Different {}",
    expected: "Different",
  },
  {
    label: "line comment prefix before a function header",
    newBody: "// helper\nfunction plus() { return 2; }",
    expected: "plus",
  },
  {
    label: "body-only fragment is rejected",
    newBody: "{\n  let normalized = value;\n}",
    expected: undefined,
  },
  {
    label: "control-flow head is rejected",
    newBody: "if (value) {\n  const normalized = value;\n}",
    expected: undefined,
  },
];

it("returns only a safely recognizable outer declaration name", () => {
  for (const testCase of cases) {
    expect(fallbackDeclarationName(testCase.newBody), testCase.label).toBe(testCase.expected);
  }
});

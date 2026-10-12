import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported).each([
  { name: "complete", content: "needle\n".repeat(4), limit: 100, observed: 4, returned: 4, search: "complete", omitted: 0, display: false, exhaustive: true },
  { name: "native bound", content: "needle\n".repeat(4), limit: 3, observed: 3, returned: 3, search: "unknown", omitted: 0, display: false, exhaustive: false },
  { name: "record omission", content: "needle\n".repeat(60), limit: 100, observed: 60, returned: 10, search: "complete", omitted: 50, display: false, exhaustive: false },
  { name: "display clipping", content: "needle " + "x".repeat(6000) + "\n", limit: 100, observed: 1, returned: 1, search: "complete", omitted: 0, display: true, exhaustive: true },
])("gates exhaustive claims for $name", scenario => {
  const report = runProgram({
    files: { "many.txt": scenario.content },
    steps: [{ code: 'store("grepRequest",' + JSON.stringify({ path: "many.txt", pattern: "needle", limit: scenario.limit }) + ");\n" + recipe("completeness") }],
  });
  const value = jsonOf(report);
  assert.equal(value.observed, scenario.observed);
  assert.equal(value.returned, scenario.returned);
  assert.equal(value.completeness.search, scenario.search);
  assert.equal(value.completeness.omittedMatches, scenario.omitted);
  assert.equal(value.exhaustive, scenario.exhaustive);
  if (scenario.name !== "record omission") assert.equal(value.completeness.displayTruncated, scenario.display);
  if (scenario.name === "native bound") assert.equal(value.completeness.limitReached, true);
}, 130_000);

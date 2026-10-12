import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("projects an independent batch without duplicated file text", () => {
  const report = runProgram({
    files: { "alpha.txt": "alpha\nbeta\n", "search.txt": "needle\n" },
    steps: [{ code: recipe("independent") }],
  });
  const rows = jsonOf(report);
  assert.deepEqual(rows.map((row: any) => row.status), ["fulfilled", "fulfilled", "rejected"]);
  assert.equal(rows[0].lines[0].raw, "alpha");
  assert.match(rows[0].lines[0].anchor, /^1:[a-f0-9]+$/);
  assert.equal(rows[0].continuation.nextOffset, 2);
  assert.deepEqual(rows[0].warnings, []);
  assert.equal(rows[1].records[0].raw, "needle");
  assert.equal(rows[1].completeness.search, "complete");
  assert.equal(rows[1].completeness.omittedMatches, 0);
  assert.equal(rows[2].id, "missing");
  assert.match(rows[2].message, /absent.txt/);
  assert.ok(!JSON.stringify(rows).includes('"text":'));
  assert.ok(!JSON.stringify(rows).includes('"display":'));
  assert.equal(report.results[0].calls.length, 3);
}, 130_000);

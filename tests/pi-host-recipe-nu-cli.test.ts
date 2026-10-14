import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, seeded, supported } from "./helpers/codemode-recipes.js";

const code = recipe("nu-cli");
it.skipIf(!supported)("parses bounded CLI JSON while preserving failure and truncation metadata", () => {
  const report = runProgram({
    files: {
      "migration-report.cjs": 'console.log(JSON.stringify([{number:1,title:"first",state:"OPEN"},{number:2,title:"second",state:"CLOSED"}]));',
      "invalid.cjs": 'process.stdout.write("not json");',
      "nonzero.cjs": 'console.log("failed"); process.exitCode=7;',
      "truncated.cjs": 'process.stdout.write("x".repeat(1100000));',
      "oversized.cjs": 'process.stdout.write("x".repeat(70000));',
      "shape.cjs": 'console.log(JSON.stringify(Array(6).fill({number:1,title:"a",state:"OPEN"})));',
    },
    steps: [
      { code },
      ...["invalid", "nonzero", "truncated", "oversized", "shape"].map(name => ({
        code: seeded('store("cliCommand", ' + JSON.stringify("node " + name + ".cjs") + ');', code),
      })),
    ],
  });
  const values: any[] = [];
  try {
    for (let i = 0; i < report.results.length; i++) values.push(jsonOf(report, i));
    assert.deepEqual(values.map(value => value.status),
      ["ok", "invalid-json", "nonzero-exit", "truncated", "output-too-large", "invalid-shape"]);
    assert.equal(values[0].returned, 2);
    assert.equal(values[0].openCount, 1);
    assert.deepEqual(values[0].issues, [{ number: 1, title: "first" }]);
    assert.equal(values[0].scope, "returned CLI rows only");
    assert.equal(values[1].exit_code, 0);
    assert.ok(values[1].message);
    assert.equal(values[2].exit_code, 7);
    assert.equal(values[3].truncated, true);
    assert.equal(typeof values[3].full_output_path, "string");
    assert.ok(values.every(value => typeof value.wall_time_seconds === "number"));
    assert.ok(values.every(value => !Object.hasOwn(value, "output")));
    assert.ok(report.results.every((result: any) => result.calls.length === 1 && result.outputBytes < 8000));
  } finally {
    for (const value of values) if (value.full_output_path) rmSync(value.full_output_path, { force: true });
  }
}, 130_000);

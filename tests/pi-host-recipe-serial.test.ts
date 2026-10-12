import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("reacquires anchors between serial dependent edits", () => {
  const report = runProgram({
    files: { "serial.txt": "phase 1\n" }, inspect: ["serial.txt"],
    steps: [{ code: recipe("serial") }],
  });
  assert.deepEqual(jsonOf(report), { ok: true, steps: 2, warnings: [] });
  assert.equal(report.files["serial.txt"], "phase 3\n");
  assert.deepEqual(report.results[0].calls.map((call: any) => call.name), ["read", "edit", "read", "edit"]);
  assert.ok(!report.results[0].text.includes("phase 1"));
  assert.ok(!report.results[0].text.includes("phase 2"));
}, 130_000);

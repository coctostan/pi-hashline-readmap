import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("edits only filtered matches without intermediate source output", () => {
  const report = runProgram({
    files: { "edit-target.txt": "TODO: change first\nKEEP\nTODO: leave this\n" },
    inspect: ["edit-target.txt"],
    steps: [{ code: recipe("search-edit") }],
  });
  assert.deepEqual(jsonOf(report), { ok: true, changed: 1, warnings: [] });
  assert.equal(report.files["edit-target.txt"], "DONE: first\nKEEP\nTODO: leave this\n");
  assert.deepEqual(report.results[0].calls.map((call: any) => call.name), ["grep", "edit"]);
  assert.ok(!report.results[0].text.includes("TODO:"));
  assert.ok(!report.results[0].text.includes("Stale read result"));
}, 130_000);

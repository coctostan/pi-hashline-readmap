import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("discards failed store writes while retaining earlier file mutations", () => {
  const report = runProgram({
    inspect: ["failed.txt"],
    steps: [
      { code: 'store("work",{path:"committed.txt"});text({saved:true});' },
      { code: recipe("store-failure") },
      { code: 'text({work:load("work")});' },
    ],
  });
  assert.equal(report.results[1].failed, true);
  assert.match(report.results[1].text, /Demonstration failure after a real mutation/);
  assert.deepEqual(jsonOf(report, 2), { work: { path: "committed.txt" } });
  assert.equal(report.storeEntries.length, 1);
  assert.equal(report.files["failed.txt"], "mutation survives\n");
}, 130_000);

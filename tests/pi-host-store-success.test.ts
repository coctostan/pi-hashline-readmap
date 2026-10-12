import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("commits successful store writes for later scripts", () => {
  const report = runProgram({ steps: [
    { code: 'store("work",{path:"stored.txt",nextOffset:2,summary:"prepared"});text({saved:true});' },
    { code: 'text({work:load("work")});' },
  ] });
  const later = jsonOf(report, 1);
  assert.ok(later.work, "Committed store value missing");
  assert.deepEqual(later.work, { path: "stored.txt", nextOffset: 2, summary: "prepared" });
  assert.deepEqual(report.storeEntries, [{ set: { work: later.work }, delete: [] }]);
}, 130_000);

import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("stores small cursor state but edits using a fresh read after mutation", () => {
  const report = runProgram({
    files: { "stored.txt": "old\nsecond\n" }, inspect: ["stored.txt"],
    steps: [
      { code: recipe("store-path") },
      { code: 'await tools.write({path:"stored.txt",content:"outside\\nsecond\\n"});text({mutated:true});' },
      { code: recipe("resume-edit") },
    ],
  });
  assert.deepEqual(jsonOf(report), { path: "stored.txt", nextOffset: 2, summary: "prepared" });
  assert.deepEqual(jsonOf(report, 2), { ok: true, warnings: [] });
  assert.equal(report.files["stored.txt"], "outside!\nsecond\n");
  assert.deepEqual(report.results[2].calls.map((call: any) => call.name), ["read", "edit"]);
  assert.ok(JSON.stringify(report.storeEntries).length < 200);
  assert.ok(!JSON.stringify(report.storeEntries).includes("anchor"));
  assert.ok(!JSON.stringify(report.storeEntries).includes("outside"));
}, 130_000);

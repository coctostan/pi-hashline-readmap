import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("hides direct declarations using real prepareLoadout without losing callable tools", () => {
  const report = runProgram({
    mode: "only", files: { "seed.txt": "alpha\n" },
    steps: [{ code: 'const r=await tools.read({path:"seed.txt"});text({raw:r.lines[0].raw});' }],
  });
  assert.ok(report.loadout, "Hidden loadout missing");
  for (const name of ["read", "edit", "grep", "ast_search", "write", "ls", "find", "bash"]) {
    assert.ok(report.loadout.hidden.includes(name), "Active tool was not hidden: " + name);
  }
  assert.deepEqual(report.loadout.modelTools, ["codemode"]);
  assert.deepEqual(jsonOf(report), { raw: "alpha" });
}, 130_000);

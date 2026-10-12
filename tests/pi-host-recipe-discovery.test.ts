import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("retains hidden safety guidelines within the default declaration budget", () => {
  const report = runProgram({
    mode: "only",
    steps: [{ code: recipe("discovery") + String.raw`
      const edit = await describeTool("edit");
      const write = await describeTool("write");
      if (!edit.includes("fresh LINE:HASH")) throw new Error("Hidden edit lost anchor guidance");
      if (!write.includes("small changes")) throw new Error("Hidden write lost edit preference");
      const entry = ALL_TOOLS.find(tool => tool.name === "read");
      if (!entry.description.includes("never print base64")) throw new Error("ALL_TOOLS lost image safety");
    ` }],
  });
  assert.equal(report.loadout.defaultInlineBudget, 3000);
  for (const name of ["read", "edit", "grep", "ast_search", "write", "ls", "find", "bash"]) {
    assert.ok(report.loadout.description.includes("### " + String.fromCharCode(96) + name + String.fromCharCode(96)), name + " omitted from default budget");
  }
  assert.match(report.loadout.description, /fresh LINE:HASH/);
  assert.match(report.loadout.description, /small changes/);
  assert.match(report.loadout.description, /never print base64/);
  const value = jsonOf(report);
  assert.ok(value.names.includes("read"));
  assert.match(value.read, /strictSymbol/);
  assert.match(value.read, /mimeType/);
  assert.match(value.read, /never print base64/);
}, 130_000);

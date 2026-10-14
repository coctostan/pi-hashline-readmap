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


it.skipIf(!supported)("keeps all nine tool sections and contract hints within the default budget", () => {
  const report = runProgram({ mode: "only", steps: [{ code: 'text("catalog checked");' }] });
  assert.equal(report.loadout.defaultInlineBudget, 3000);
  const catalog = report.loadout.description;
  for (const name of ["read", "edit", "grep", "ast_search", "write", "ls", "find", "bash", "nu"]) {
    assert.ok(catalog.includes("### `" + name + "`"), name + " omitted from default budget");
  }
  for (const hint of [
    "Positive 1-indexed int or base-10 string; not with symbol",
    "Positive int or obvious base-10 numeric string",
    "0-based char offset into one line; needs offset",
    "Window chars; default 500, max 10000",
    "Non-negative int or obvious base-10 numeric string",
    "Non-negative int/base-10 string; requires scope: symbol",
    "Relative to resolved search root (path, default cwd); join to that root before read/edit.",
    "Entry basename; join to the returned path before read/edit.",
    "Resolved absolute directory; join with entries[].name before read/edit.",
  ]) assert.ok(catalog.includes(hint), "Required inline contract hint missing: " + hint);
  assert.match(catalog, /fresh LINE:HASH/);
  assert.match(catalog, /small changes/);
  assert.match(catalog, /never print base64/);
}, 130_000);

import assert from "node:assert/strict";
import { it } from "vitest";
import { runProgram } from "./helpers/codemode-recipes.js";

const FAILURE = "{ text, tool, ok: false, error }";
const RESOLVES_TO: Record<string, string> = {
  read: '{ text, path, range, lines, continuation, warnings } | { text, type: "image", data, mimeType, note }'
    + ` | { text, path, ambiguity } | { text, kind: "notice", warnings } | ${FAILURE}`,
  edit: `{ text, ok, path, diff, firstChangedLine?, warnings } | ${FAILURE}`,
  grep: `{ text, totalMatches, completeness, records } | ${FAILURE}`,
  ast_search: `{ text, files } | ${FAILURE}`,
  write: `{ text, path, lines, warnings } | ${FAILURE}`,
  ls: `{ text, path, entries, truncated } | ${FAILURE}`,
  find: `{ text, entries, truncated } | ${FAILURE}`,
  bash: "{ output, truncated, full_output_path?, exit_code, wall_time_seconds }",
};

it("lists every Hashline output schema's fields in its Codemode line on the selected host", () => {
  const { descriptions } = runProgram({ steps: [] }).loadout;
  for (const [name, fields] of Object.entries(RESOLVES_TO)) {
    assert.ok(String(descriptions[name]).endsWith("\n\nCodemode: `tools." + name + "(args)` resolves to `" + fields + "`."),
      name + ": " + descriptions[name]);
  }
  for (const [name, description] of Object.entries(descriptions)) {
    assert.ok(!String(description).includes("shows its type"), name + " gets the describeTool pointer");
  }
});

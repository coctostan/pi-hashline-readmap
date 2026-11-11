import assert from "node:assert/strict";
import { it } from "vitest";
import { runProgram } from "./helpers/codemode-recipes.js";

const READ_LINE = '{ text, path, range, lines, continuation, warnings } | { text, type: "image", data, mimeType, note }'
  + ' | { text, path, ambiguity } | { text, kind: "notice", warnings } | { text, tool, ok: false, error }';
const WITH_OUTPUT_SCHEMA = ["read", "edit", "grep", "ast_search", "write", "ls", "find", "bash"];

it("lists every Hashline output schema's fields in its Codemode line on the selected host", () => {
  const { descriptions } = runProgram({ steps: [] }).loadout;
  const resolves = (name: string) =>
    descriptions[name]?.match(new RegExp("\\nCodemode: `tools\\." + name + "\\(args\\)` resolves to (.*)\\.$"))?.[1];
  assert.equal(resolves("read"), "`" + READ_LINE + "`");
  for (const name of WITH_OUTPUT_SCHEMA) {
    assert.match(resolves(name) ?? "", /^`\{ \w.*\}`$/, name + " must list its fields");
  }
  for (const [name, description] of Object.entries(descriptions)) {
    assert.ok(!String(description).includes("shows its type"), name + " gets the describeTool pointer");
  }
});

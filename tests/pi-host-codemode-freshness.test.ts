import assert from "node:assert/strict";
import { it } from "vitest";
import { runProgram } from "./helpers/codemode-recipes.js";

// Another extension's async tool_result handler delays the write's result, so the read beside it
// is recorded after the write ran but before the write's own result.
const slowExtension = { PI_CODEMODE_EXTENSION_BEFORE: "tests/fixtures/slow-tool-result-extension.ts" };

it("keeps a file written beside another call in Promise.all fresh for the next turn's anchored edit", () => {
  const report = runProgram({
    files: { "f.txt": "old\n", "g.txt": "gamma\n" },
    inspect: ["f.txt"],
    steps: [
      { code: `await tools.read({ path: "f.txt" }); text("read");` },
      { context: true },
      {
        code: `const [w] = await Promise.all([
  tools.write({ path: "f.txt", content: "one\\ntwo\\nthree\\n" }),
  tools.read({ path: "g.txt" }),
]);
store("anchor", w.lines[1].anchor);
text("written");`,
      },
      { context: true },
      {
        code: `const r = await tools.edit({ path: "f.txt", edits: [{ set_line: { anchor: load("anchor"), new_text: "TWO" } }], errorMode: "value" });
text(JSON.stringify({ ok: r.ok, code: r.error?.code ?? null }));`,
      },
    ],
  }, slowExtension);
  assert.ok(!report.results[1].failed, report.results[1].text);
  assert.ok(report.results[2].text.includes('{"ok":true,"code":null}'), report.results[2].text);
  assert.equal(report.files["f.txt"], "one\nTWO\nthree\n");
}, 130_000);

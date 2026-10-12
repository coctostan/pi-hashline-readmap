import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported).each([
  { kind: "text", request: { path: "alpha.txt", limit: 1 }, images: 0 },
  { kind: "image", request: { path: "fixture.png", offset: 0 }, images: 1 },
  { kind: "ambiguity", request: { path: "ambiguous.ts", symbol: "run" }, images: 0 },
  { kind: "notice", request: { path: "notice.png" }, images: 0 },
  { kind: "failure", request: { path: "absent.txt", errorMode: "value" }, images: 0 },
])("projects the real $kind read variant", scenario => {
  const report = runProgram({
    files: {
      "alpha.txt": "alpha\nbeta\n",
      "ambiguous.ts": "export class A { run() { return 1; } }\nexport class B { run() { return 2; } }\n",
      "notice.png": "delegated notice\n",
    },
    steps: [{ code: 'store("readRequest",' + JSON.stringify(scenario.request) + ");\n" + recipe("read-variants") }],
  });
  const summary = jsonOf(report);
  assert.equal(summary.kind, scenario.kind);
  assert.equal(report.results[0].images.length, scenario.images);
  assert.ok(!report.results[0].text.includes("iVBORw0KGgo"));
  assert.ok(!Object.hasOwn(summary, "data"));
  if (scenario.kind === "text") {
    assert.equal(summary.lines[0].raw, "alpha");
    assert.equal(summary.continuation.nextOffset, 2);
    assert.ok(!Object.hasOwn(summary, "text"));
  }
  if (scenario.kind === "image") {
    assert.equal(summary.mimeType, "image/png");
    assert.match(summary.note, /params adjusted/);
  }
  if (scenario.kind === "ambiguity") {
    assert.equal(summary.ambiguity.totalCandidates, 2);
    assert.match(summary.choices, /A.run|B.run/);
    assert.ok(!Object.hasOwn(summary, "lines"));
  }
  if (scenario.kind === "notice") assert.match(summary.notice, /delegated notice/);
  if (scenario.kind === "failure") {
    assert.equal(summary.code, "file-not-found");
    assert.match(summary.message, /absent.txt/);
  }
}, 130_000);

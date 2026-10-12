import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, recipe, runProgram, supported } from "./helpers/codemode-recipes.js";

const code = recipe("nu-discovery");
it.skipIf(!supported)("joins bounded file discovery without pretending it is exhaustive", () => {
  const report = runProgram({
    files: {
      "migration/a.ts": "a", "migration/b.ts": "bbb", "migration/c.ts": "cccc",
      "migration/zero.ts": "", "migration/oversize.ts": "x".repeat(2048),
      "small/b.ts": "bbb",
    },
    steps: [
      { code },
      { code: 'store("discoveryPath", "small");\n' + code },
      { code: 'store("discoveryPath", "absent");\n' + code },
    ],
  });
  const value = jsonOf(report);
  assert.deepEqual(value.inputs.map((input: any) => input.id), ["ls", "find"]);
  assert.ok(value.inputs.every((input: any) => input.status === "fulfilled" && input.truncated));
  assert.deepEqual(value.inputs[1].entries.map((entry: any) => entry.path), ["c.ts", "b.ts"]);
  assert.deepEqual(value.joined, [{ path: "b.ts", type: "file" }]);
  assert.deepEqual(value.counts, { joinedFiles: 1 });
  assert.equal(value.exhaustive, false);
  const complete = jsonOf(report, 1);
  assert.equal(complete.exhaustive, true);
  assert.deepEqual(complete.joined, [{ path: "b.ts", type: "file" }]);
  const missing = jsonOf(report, 2);
  assert.equal(missing.exhaustive, false);
  assert.ok(missing.inputs.every((input: any) => input.status === "rejected" && /absent/.test(input.message)));
  assert.deepEqual(missing.joined, []);
  assert.ok(!JSON.stringify(value).includes('"text":'));
  assert.ok(!JSON.stringify(value).includes('"size":'));
  assert.ok(report.results.every((result: any) => result.calls.length === 2 && result.outputBytes < 8000));
}, 130_000);

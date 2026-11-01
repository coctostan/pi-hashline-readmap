import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, runProgram, supported, version } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("captures real selected-host script results", () => {
  const report = runProgram({
    files: { "seed.txt": "alpha\nbeta\n" },
    steps: [
      { code: 'const r = await tools.read({path:"seed.txt",limit:1}); text({raw:r.lines[0].raw,next:r.continuation.nextOffset});' },
      { code: 'text({later:true});' },
    ],
  });
  assert.equal(report.version, version);
  assert.deepEqual(jsonOf(report), { raw: "alpha", next: 2 });
  assert.deepEqual(jsonOf(report, 1), { later: true });
  assert.deepEqual(report.results[0].calls.map((c: any) => c.name), ["read"]);
}, 130_000);


it.skipIf(!supported)("measures final rendered output including outer hygiene notices", () => {
  const report = runProgram({
    steps: [{ code: String.raw`
      const fresh = await tools.read({path:"visible.ts"});
      await tools.edit({path:"visible.ts",edits:[{set_line:{
        anchor:fresh.lines[0].anchor,new_text:"export const visible = 2;"
      }}]});
      text({ok:true});
    ` }],
  }, { PI_CODEMODE_VISIBLE: "1" });
  const result = report.results[0];
  assert.equal(result.failed, false);
  assert.match(result.text, /Stale read result/);
  assert.equal(result.outputBytes, Buffer.byteLength(result.text, "utf8"));
}, 130_000);

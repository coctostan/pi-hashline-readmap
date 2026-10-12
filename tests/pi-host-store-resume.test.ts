import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("loads committed store values after reopening a real persisted session", () => {
  const report = runProgram({ persist: true, steps: [
    { code: 'store("work",{path:"persisted.txt",nextOffset:9});text({saved:true});' },
    { resume: true },
    { code: 'text({work:load("work")});' },
    { code: 'store("work",{path:"persisted.txt",nextOffset:10});text({updated:true});' },
    { resume: true },
    { code: 'text({work:load("work")});' },
  ] });
  assert.deepEqual(jsonOf(report, 1), { work: { path: "persisted.txt", nextOffset: 9 } });
  assert.deepEqual(jsonOf(report, 3), { work: { path: "persisted.txt", nextOffset: 10 } });
}, 130_000);

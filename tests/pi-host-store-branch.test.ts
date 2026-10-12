import assert from "node:assert/strict";
import { it } from "vitest";
import { jsonOf, runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("loads ancestor store values without leaking sibling writes", () => {
  const report = runProgram({ steps: [
    { code: 'store("common","root");text({root:true});' },
    { checkpoint: "root" },
    { code: 'store("side","A");text({side:"A"});' },
    { checkpoint: "A" },
    { branch: "root" },
    { code: 'text({common:load("common"),side:load("side")??null});' },
    { code: 'store("side","B");text({side:"B"});' },
    { branch: "A" },
    { code: 'text({common:load("common"),side:load("side")});' },
  ] });
  assert.deepEqual(jsonOf(report, 2), { common: "root", side: null });
  assert.deepEqual(jsonOf(report, 4), { common: "root", side: "A" });
}, 130_000);

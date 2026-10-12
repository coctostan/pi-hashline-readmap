import assert from "node:assert/strict";
import { it } from "vitest";
import { runProgram, supported } from "./helpers/codemode-recipes.js";

it.skipIf(!supported).each(["independent", "search-edit"] as const)(
  "captures native normal-mode evidence for %s", normalWorkflow => {
    const report = runProgram({
      mode: "on", normalWorkflow,
      files: {
        "alpha.txt": "alpha\nbeta\n", "search.txt": "needle\n",
        "edit-target.txt": "TODO: change first\nKEEP\nTODO: leave this\n",
      },
      inspect: ["edit-target.txt"], steps: [],
    });
    assert.ok(report.task, "Normal workflow evidence missing");
    assert.ok(report.results.every((result: any) => result.direct));
    assert.ok(report.results.every((result: any) => Number.isFinite(result.outputBytes)));
    if (normalWorkflow === "independent") {
      assert.deepEqual(report.task.map((row: any) => row.status), ["fulfilled", "fulfilled", "rejected"]);
      assert.equal(report.task[0].lines[0].raw, "alpha");
      assert.equal(report.task[1].records[0].raw, "needle");
      assert.match(report.task[2].message, /absent.txt/);
    } else {
      assert.deepEqual(report.task, { ok: true, changed: 1, warnings: [] });
      assert.equal(report.files["edit-target.txt"], "DONE: first\nKEEP\nTODO: leave this\n");
    }
  }, 130_000,
);

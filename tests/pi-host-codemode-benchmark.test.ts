import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { it } from "vitest";
import { host, supported, version } from "./helpers/codemode-recipes.js";

it.skipIf(!supported)("benchmarks equivalent normal and codemode-only workflows with bounded metrics", () => {
  const run = spawnSync(process.execPath, ["scripts/benchmark-codemode.mjs"], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PI_COMPAT_HOST: host, PI_CODEMODE_BENCH_ITERATIONS: "1" },
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.version, version);
  assert.equal(report.host, host);
  assert.equal(report.rows.length, 4);
  for (const row of report.rows) {
    assert.equal(row.correctness, true);
    for (const field of ["declarationBytes", "estimatedDeclarationTokens", "outputBytes", "toolCalls", "discoveryCalls", "discoveryMs", "processMs", "toolExecutionMs", "setupAndTransportMs"]) {
      assert.ok(Number.isFinite(row[field]) && row[field] >= 0, field);
    }
    assert.equal(row.toolCalls, row.workflow === "independent" ? 3 : 2);
    assert.equal(row.discoveryCalls, row.mode === "only" ? 2 : 0);
    assert.equal(row.outerCodemodeCalls, row.mode === "only" ? 1 : 0);
  }
  assert.match(report.methodology.tokens, /not provider-tokenizer/);
  assert.match(report.methodology.timing, /No warm/);
  assert.match(report.methodology.limits, /not model task quality/);
}, 130_000);

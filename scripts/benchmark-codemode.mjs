import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertCompatHost } from "./pi-compat-host.mjs";

const { host, version } = assertCompatHost(process.env.PI_COMPAT_HOST);
const iterations = Number(process.env.PI_CODEMODE_BENCH_ITERATIONS ?? 3);
assert.ok(Number.isSafeInteger(iterations) && iterations >= 1 && iterations <= 10, "Benchmark iterations must be 1..10");
const doc = readFileSync("docs/codemode-recipes.md", "utf8");
function recipe(id) {
  const section = doc.split("<!-- recipe:" + id + " -->")[1]?.split("<!-- /recipe:" + id + " -->")[0];
  const code = section?.match(/~~~js\n([\s\S]*?)\n~~~/)?.[1];
  assert.ok(code, "Missing benchmark recipe: " + id);
  return code;
}
const files = {
  "alpha.txt": "alpha\nbeta\n",
  "search.txt": "needle\n",
  "edit-target.txt": "TODO: change first\nKEEP\nTODO: leave this\n",
};
function run(program) {
  const started = performance.now();
  const stdout = execFileSync(process.execPath, [resolve("tests/helpers/selected-host-codemode.mjs"), host], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env, PI_CODEMODE_PROGRAM: JSON.stringify(program),
      PI_CODEMODE_CASE: 'text("case=PASS");', PI_HASHLINE_BASH_CONTEXT_GUARD: "0",
    },
  });
  const processMs = performance.now() - started;
  const report = JSON.parse(stdout.trim().split("\n").at(-1));
  assert.equal(report.program, true);
  assert.equal(report.version, version);
  return { report, processMs };
}
function outputItems(result) {
  const values = [];
  for (const line of result.text.split("\n")) {
    if (!/^[\[{]/.test(line)) continue;
    try { values.push(JSON.parse(line)); } catch { /* Host notices are not task summaries. */ }
  }
  return values;
}
function normalize(value, cwd) {
  return JSON.parse(JSON.stringify(value).replaceAll(cwd, "<cwd>"));
}
const rows = [];
for (const workflow of ["independent", "search-edit"]) {
  for (let sample = 1; sample <= iterations; sample++) {
    const normal = run({ mode: "on", normalWorkflow: workflow, files, inspect: ["edit-target.txt"], steps: [] });
    const discovery = [
      "const benchmarkDiscoveryStarted = Date.now();",
      'await searchTools("read files images",{limit:3});',
      'await describeTool("read");',
      "const benchmarkDiscoveryMs = Date.now() - benchmarkDiscoveryStarted;",
    ].join("\n");
    const discoverySummary = 'text({benchmarkDiscovery:{calls:2,elapsedMs:benchmarkDiscoveryMs}});';
    const only = run({
      mode: "only", files, inspect: ["edit-target.txt"],
      steps: [{ code: discovery + "\n" + recipe(workflow) + "\n" + discoverySummary }],
    });
    assert.equal(only.report.results.length, 1);
    assert.equal(only.report.results[0].failed, false, only.report.results[0].text);
    const values = outputItems(only.report.results[0]);
    assert.equal(values.length, 2, "Expected task summary plus explicit discovery timing");
    assert.deepEqual(normalize(normal.report.task, normal.report.cwd), normalize(values[0], only.report.cwd));
    assert.deepEqual(normal.report.files, only.report.files);
    for (const [mode, runResult] of [["on", normal], ["only", only]]) {
      const report = runResult.report;
      const discoveryMetrics = mode === "only" ? values[1].benchmarkDiscovery : { calls: 0, elapsedMs: 0 };
      const toolExecutionMs = report.results.reduce((sum, result) => sum + result.elapsedMs, 0);
      rows.push({
        workflow, mode, sample, correctness: true,
        declarationBytes: report.loadout.declarationBytes,
        estimatedDeclarationTokens: report.loadout.estimatedDeclarationTokens,
        outputBytes: report.results.reduce((sum, result) => sum + result.outputBytes, 0),
        toolCalls: report.results.reduce((sum, result) => sum + result.calls.length, 0),
        discoveryCalls: discoveryMetrics.calls,
        discoveryMs: discoveryMetrics.elapsedMs,
        outerCodemodeCalls: mode === "only" ? 1 : 0,
        processMs: runResult.processMs,
        toolExecutionMs,
        setupAndTransportMs: Math.max(0, runResult.processMs - toolExecutionMs),
      });
    }
  }
}
console.log(JSON.stringify({
  host, version, node: process.version, iterations,
  command: "PI_COMPAT_HOST=" + JSON.stringify(host) + " node scripts/benchmark-codemode.mjs",
  fixtures: files,
  methodology: {
    normal: "Real direct tool pipeline under on loadout; independent requests intentionally executed as separate direct calls",
    only: "Same work through tested documentation snippets under real only loadout; two awaited discovery calls",
    declarations: "UTF-8 JSON bytes of model tool names/descriptions/parameter schemas; excludes system prompt and provider framing",
    tokens: "Estimated declaration tokens = serialized declaration characters / 4; not provider-tokenizer counts",
    output: "UTF-8 rendered text bytes, including host/notice framing; excludes structured JSON reports and binary images",
    timing: "Milliseconds; each sample starts a fresh host process. No warm-process or warm-VM lane measured.",
    overhead: "Separate process duration, invocation duration, setup/transport difference, tool counts and discovery counts/timing",
    limits: "Deterministic credential-free fixtures, not model task quality, provider latency, cost, or a recommendation to change defaults",
  },
  rows,
}, null, 2));

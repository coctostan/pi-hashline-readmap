import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { it } from "vitest";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";

const { host, version } = selectCompatHost();

it("checks extension declarations against the selected host", () => {
  const run = spawnSync(process.execPath, [resolve("scripts/typecheck-pi-host.mjs")], {
    env: { ...process.env, PI_COMPAT_HOST: host },
    encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout.trim().split("\n").at(-1)!);
  assert.equal(report.version, version);
  assert.equal(report.diagnostics, 0);
  const selectedModules = realpathSync(resolve(host, "../.."));
  const lockedModules = realpathSync(resolve("node_modules"));
  for (const name of ["pi-coding-agent", "pi-agent-core", "pi-ai", "pi-tui"]) {
    const path = report.declarations["@earendil-works/" + name];
    assert.ok(path.startsWith(selectedModules + sep), "selected declaration " + name);
    if (process.env.PI_COMPAT_HOST) assert.ok(!path.startsWith(lockedModules + sep), "no locked declaration " + name);
  }
  assert.ok(report.extensionFiles.includes(resolve("index.ts")));
  assert.ok(report.extensionFiles.includes(resolve("src/codemode-integration.ts")));
  assert.ok(report.extensionFiles.includes(resolve("src/raw-argument-guard.ts")));
}, 70_000);

it("rejects an incompatible selected-host renderer boundary", () => {
  const run = spawnSync(process.execPath,
    [resolve("scripts/typecheck-pi-host.mjs"), "scripts/fixtures/pi-current-host-invalid.ts"], {
      env: { ...process.env, PI_COMPAT_HOST: host },
      encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
    });
  assert.equal(run.status, 1);
  if (!run.stderr.includes("error TS2322")) throw new Error("negative boundary must produce TS2322");
  assert.match(run.stderr, /Type 'string' is not assignable to type 'number'/);
  assert.match(run.stderr, /pi-current-host-invalid\.ts/);
}, 70_000);

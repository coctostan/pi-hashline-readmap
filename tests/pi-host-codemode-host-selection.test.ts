import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";

it("does not skip a selected executorless codemode host", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-264-no-executor-"));
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "9.9.9" }));
    const run = spawnSync(process.execPath,
      [resolve("node_modules/vitest/vitest.mjs"), "run", "tests/pi-host-codemode.test.ts"], {
        env: { ...process.env, PI_COMPAT_HOST: root },
        encoding: "utf8", timeout: 30_000, maxBuffer: 10 * 1024 * 1024,
      });
    assert.notEqual(run.status, 0, "an executorless host must fail instead of skipping");
    assert.match(run.stdout + run.stderr, /Selected Pi host 9\.9\.9 has no codemode executor/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 40_000);

it("fails at helper load when the locked host has no executor", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-locked-no-executor-"));
  try {
    vi.resetModules();
    vi.stubEnv("PI_COMPAT_HOST", undefined);
    vi.doMock("../scripts/pi-compat-host.mjs", () => ({ selectCompatHost: () => ({ host: root, version: "9.9.9" }) }));
    await expect(import("./helpers/codemode-recipes.js")).rejects.toThrow(/Selected Pi host 9\.9\.9 has no codemode executor/);
  } finally {
    vi.doUnmock("../scripts/pi-compat-host.mjs");
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  }
});


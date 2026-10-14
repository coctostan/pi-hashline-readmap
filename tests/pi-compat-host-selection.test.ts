import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "vitest";

it("requires an exact explicit compatibility host without fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-264-selection-"));
  const utility = pathToFileURL(resolve("scripts/pi-compat-host.mjs")).href;
  const probe = `import { assertCompatHost } from ${JSON.stringify(utility)};
    console.log(JSON.stringify(assertCompatHost(process.argv[1])));`;
  const select = (path: string) => spawnSync(process.execPath,
    ["--input-type=module", "-e", probe, path], { encoding: "utf8" });
  try {
    for (const [name, version, executor] of [
      ["valid", "1.2.0", true],
      ["wrong", "1.0.0", true],
      ["no-executor", "1.2.0", false],
    ] as const) {
      const path = join(root, name);
      mkdirSync(path);
      writeFileSync(join(path, "package.json"), JSON.stringify({ version }));
      if (executor) {
        mkdirSync(join(path, "dist/extensions/codemode"), { recursive: true });
        writeFileSync(join(path, "dist/extensions/codemode/execute.js"), "");
      }
    }
    const ok = select(join(root, "valid"));
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout), { host: join(root, "valid"), version: "1.2.0" });
    const wrong = select(join(root, "wrong"));
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /Compatibility host must be exactly Pi 1\.2\.0/);
    const absent = select(join(root, "missing"));
    assert.equal(absent.status, 1);
    assert.match(absent.stderr, /ENOENT/);
    const noExecutor = select(join(root, "no-executor"));
    assert.equal(noExecutor.status, 1);
    assert.match(noExecutor.stderr, /Explicit compatibility host has no codemode executor/);
    const unset = select("");
    assert.equal(unset.status, 1);
    assert.match(unset.stderr, /PI_COMPAT_HOST must explicitly select/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


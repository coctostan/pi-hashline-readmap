import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "vitest";

it("selects the locked host unless PI_COMPAT_HOST overrides it, expecting the selected install's version", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-compat-selection-"));
  const utility = pathToFileURL(resolve("scripts/pi-compat-host.mjs")).href;
  const probe = `import { selectCompatHost } from ${JSON.stringify(utility)};
    console.log(JSON.stringify(selectCompatHost()));`;
  const select = (override?: string) => {
    const env = { ...process.env };
    delete env.PI_COMPAT_HOST;
    if (override !== undefined) env.PI_COMPAT_HOST = override;
    return spawnSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8", env });
  };
  try {
    const locked = select();
    assert.equal(locked.status, 0, locked.stderr);
    const lockedVersion = JSON.parse(readFileSync("package-lock.json", "utf8"))
      .packages["node_modules/@earendil-works/pi-coding-agent"].version;
    assert.deepEqual(JSON.parse(locked.stdout),
      { host: resolve("node_modules/@earendil-works/pi-coding-agent"), version: lockedVersion });
    assert.deepEqual(JSON.parse(select("").stdout), JSON.parse(locked.stdout), "an empty override selects the locked host");

    const valid = join(root, "valid");
    mkdirSync(valid);
    writeFileSync(join(valid, "package.json"), JSON.stringify({ version: "9.9.9" }));
    const ok = select(valid);
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(JSON.parse(ok.stdout), { host: valid, version: "9.9.9" });

    const absent = select(join(root, "missing"));
    assert.equal(absent.status, 1);
    assert.match(absent.stderr, /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

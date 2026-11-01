import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { it } from "vitest";
import { selectCompatHost } from "../scripts/pi-compat-host.mjs";

const { host } = selectCompatHost();
const supported = existsSync(join(host, "dist/extensions/codemode/execute.js"));
if (process.env.PI_COMPAT_HOST && !supported) throw new Error("Explicit compatibility host has no codemode executor");

it.skipIf(!supported)("propagates script cancellation into nested execution", () => {
  const stdout = execFileSync(process.execPath, [resolve("tests/helpers/selected-host-codemode.mjs"), host], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PI_CODEMODE_CANCEL: "1", PI_HASHLINE_BASH_CONTEXT_GUARD: "0",
      PI_CODEMODE_CASE: 'await tools.read({path:"fixture.png"}); text("case=PASS");' },
  });
  const result = JSON.parse(stdout.trim().split("\n").at(-1)!);
  assert.equal(result.completed, false, "cancelled script must fail");
  assert.equal(result.cancelStarted, true);
  assert.equal(result.cancelObserved, true);
}, 130_000);


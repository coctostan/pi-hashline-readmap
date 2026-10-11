import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

const lockedHost = resolve(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");
const host = process.env.PI_COMPAT_HOST ? resolve(process.env.PI_COMPAT_HOST) : lockedHost;
const supported = existsSync(join(host, "dist/extensions/codemode/execute.js"));
if (process.env.PI_COMPAT_HOST && !supported) throw new Error("Explicit compatibility host has no codemode executor");

it.skipIf(!supported)("verifies forwarded native image persistence", () => {
  const stdout = execFileSync(process.execPath, [resolve("tests/helpers/selected-host-codemode.mjs"), host], {
    encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, PI_CODEMODE_CASE: "for (const path of [\"fixture.png\", \"magic.dat\"]) {\n  const r = await tools.read({ path, offset: 0 });\n  if (r.type !== \"image\" || !r.note.includes(\"params adjusted\")) throw new Error(\"image envelope/notes\");\n  image(r);\n}\ntext(\"case=PASS\");",
      PI_CODEMODE_DIRECT_IMAGE: "1", PI_HASHLINE_BASH_CONTEXT_GUARD: "0" },
  });
  const result = JSON.parse(stdout.trim().split("\n").at(-1)!);
  assert.equal(result.persistedImages, 2, "image persistence must be verified");
  assert.equal(result.images, 2);
}, 130_000);


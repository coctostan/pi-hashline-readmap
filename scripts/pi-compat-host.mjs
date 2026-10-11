import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PI_COMPAT_VERSION = "1.1.0";

export function assertCompatHost(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("PI_COMPAT_HOST must explicitly select a Pi 1.1.0 installation");
  }
  const host = resolve(input);
  const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
  if (version !== PI_COMPAT_VERSION) {
    throw new Error("Compatibility host must be exactly Pi 1.1.0 (got " + version + ")");
  }
  if (!existsSync(join(host, "dist/extensions/codemode/execute.js"))) {
    throw new Error("Explicit compatibility host has no codemode executor");
  }
  return { host, version };
}


import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const lockedHost = resolve(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");

// PI_COMPAT_HOST overrides the locked host; the selected install's own version is the one expected.
export function selectCompatHost(input = process.env.PI_COMPAT_HOST) {
  const host = input ? resolve(input) : lockedHost;
  const version = JSON.parse(readFileSync(join(host, "package.json"), "utf8")).version;
  return { host, version };
}

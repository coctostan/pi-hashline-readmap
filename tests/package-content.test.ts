import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const pkg = JSON.parse(readFileSync("package.json", "utf8")); const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
describe("0.13.0 package contents", () => {
  it("versions package/lock and ships every README-linked document and documented scanner", () => {
    expect(pkg.version).toBe("0.13.0"); expect(lock.version).toBe("0.13.0"); expect(lock.packages[""].version).toBe("0.13.0");
    expect(pkg.files).toContain("docs/"); expect(pkg.files).toContain("scripts/scan-ambiguous-read-calls.mjs");
    expect(pkg.files).toContain("scripts/scan-ambiguous-read-calls.d.mts");
    const readme = readFileSync("README.md", "utf8"); const linked = [...readme.matchAll(/\]\((docs\/[^)#]+\.md)(?:#[^)]+)?\)/g)].map((match) => match[1]);
    expect(linked).toEqual(expect.arrayContaining(["docs/bash-output.md", "docs/configuration.md", "docs/context-hygiene.md", "docs/integrations.md", "docs/structured-output.md", "docs/tool-metadata.md"]));
    const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })); const names = new Set<string>(packed[0].files.map((file: { path: string }) => file.path));
    for (const path of [...linked, "scripts/scan-ambiguous-read-calls.mjs"]) expect(names.has(path), path).toBe(true);
  }, 30_000);
});

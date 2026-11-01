import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const lockedPi = packageLock.packages["node_modules/@earendil-works/pi-coding-agent"];

describe("TypeBox development baseline", () => {
  it("installs the exact TypeBox version bundled by the locked Pi", () => {
    const hostTypebox = lockedPi?.dependencies?.typebox;
    expect(hostTypebox).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.devDependencies?.typebox).toBe(hostTypebox);
    expect(packageLock.packages[""].devDependencies?.typebox).toBe(hostTypebox);
    expect(packageLock.packages["node_modules/typebox"]?.version).toBe(hostTypebox);
  });
});

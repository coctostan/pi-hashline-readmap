import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("TypeBox development baseline", () => {
  it("installs the exact TypeBox version bundled by Pi 0.84.2", () => {
    expect(packageJson.devDependencies?.typebox).toBe("1.3.7");
    expect(packageLock.packages[""].devDependencies?.typebox).toBe("1.3.7");
    expect(packageLock.packages["node_modules/typebox"]?.version).toBe("1.3.7");
  });
});

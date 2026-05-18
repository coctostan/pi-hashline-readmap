import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("package version", () => {
  it("is bumped for the compact provider-visible metadata release", () => {
    expect(packageJson.version).toBe("0.8.10");
    expect(packageLock.version).toBe("0.8.10");
    expect(packageLock.packages[""].version).toBe("0.8.10");
  });
});

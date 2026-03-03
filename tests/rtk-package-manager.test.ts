import { describe, it, expect } from "vitest";
import { isPackageManagerCommand, compressPackageManagerOutput } from "../src/rtk/package-manager.js";

describe("isPackageManagerCommand", () => {
  it("matches npm/yarn/pnpm install variants", () => {
    expect(isPackageManagerCommand("npm install")).toBe(true);
    expect(isPackageManagerCommand("npm ci")).toBe(true);
    expect(isPackageManagerCommand("yarn")).toBe(true);
    expect(isPackageManagerCommand("yarn install")).toBe(true);
    expect(isPackageManagerCommand("yarn add lodash")).toBe(true);
    expect(isPackageManagerCommand("pnpm install")).toBe(true);
    expect(isPackageManagerCommand("pnpm i")).toBe(true);
    expect(isPackageManagerCommand("pnpm add zod")).toBe(true);
  });

  it("does not match non-install package-manager commands", () => {
    expect(isPackageManagerCommand("npm test")).toBe(false);
    expect(isPackageManagerCommand("npm run build")).toBe(false);
    expect(isPackageManagerCommand("yarn test")).toBe(false);
  });
});

describe("compressPackageManagerOutput", () => {
  it("strips progress and fetch/timing noise", () => {
    const output = [
      "npm http fetch GET 200 https://registry.npmjs.org/react 150ms",
      "npm timing arborist:ctor Completed in 1ms",
      "⠋ idealTree:resolve",
      "⠹ idealTree:buildDeps",
      "npm WARN deprecated inflight@1.0.6: This module is not supported",
      "added 342 packages, removed 3 packages, and audited 344 packages in 6s",
      "found 0 vulnerabilities",
      "npm ERR! code ERESOLVE",
      "up to date, audited 344 packages in 2s",
      "Done in 7.32s.",
      "Resolution step details: foo@1.0.0 -> bar@2.0.0",
    ].join("\n");

    const result = compressPackageManagerOutput(output);

    expect(result).not.toContain("npm http fetch GET");
    expect(result).not.toContain("npm timing");
    expect(result).not.toContain("⠋");
    expect(result).not.toContain("Resolution step details");
  });

  it("preserves package summary line", () => {
    const output = [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
      "line 9",
      "added 142 packages in 3.2s",
    ].join("\n");

    const result = compressPackageManagerOutput(output);
    expect(result).toContain("added 142 packages in 3.2s");
  });

  it("preserves WARN lines", () => {
    const output = [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
      "line 9",
      "npm WARN deprecated left-pad@1.3.0: use String.prototype.padStart()",
      "added 1 package in 1s",
    ].join("\n");

    const result = compressPackageManagerOutput(output);
    expect(result).toContain("npm WARN deprecated left-pad@1.3.0");
  });

  it("preserves ERR! lines", () => {
    const output = [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
      "line 9",
      "npm ERR! code EACCES",
      "npm ERR! syscall open",
    ].join("\n");

    const result = compressPackageManagerOutput(output);
    expect(result).toContain("npm ERR! code EACCES");
    expect(result).toContain("npm ERR! syscall open");
  });

  it("returns output unchanged if fewer than 10 lines", () => {
    const shortOutput = [
      "npm http fetch GET 200 https://registry.npmjs.org/react 150ms",
      "npm timing arborist:ctor Completed in 1ms",
      "⠋ idealTree:resolve",
      "npm WARN deprecated left-pad@1.3.0: use String.prototype.padStart()",
      "added 1 package in 1s",
      "found 0 vulnerabilities",
    ].join("\n");

    expect(compressPackageManagerOutput(shortOutput)).toBe(shortOutput);
  });
});

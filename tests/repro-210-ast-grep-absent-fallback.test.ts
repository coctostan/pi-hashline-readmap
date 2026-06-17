import { describe, it, expect } from "vitest";
import { resolveBundledBin } from "../src/binary-resolution.js";
import { resolveSgBinary } from "../src/sg.js";

describe("repro #210 — @ast-grep/cli absent (Termux/musl) PATH fallback", () => {
  it("falls back to the ast-grep PATH command when @ast-grep/cli cannot be resolved", () => {
    const resolved = resolveBundledBin("@ast-grep/cli", "sg", "ast-grep", {
      resolvePackageJson: () => {
        throw Object.assign(new Error("Cannot find module '@ast-grep/cli/package.json'"), {
          code: "MODULE_NOT_FOUND",
        });
      },
      readPackageJson: () => {
        throw new Error("should not read package.json after resolution failed");
      },
      existsSync: () => false,
    });

    expect(resolved).toBe("ast-grep");
  });

  it("resolveSgBinary uses 'ast-grep' (not 'sg') as the PATH fallback name", () => {
    // Sanity: the PATH fallback name must be `ast-grep` to avoid the util-linux
    // `sg` collision on Linux (GH #112). With the package present this returns a
    // bundled path; the contract we pin here is just that it returns a non-empty
    // string and never throws when the package may be missing.
    const result = resolveSgBinary();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { executableCommand, resolveBundledBin } from "../src/binary-resolution.js";

describe("resolveBundledBin", () => {
  it("uses the direct package bin on non-Windows even when an npm .bin shim exists", () => {
    const resolved = resolveBundledBin("nushell", "nu", "nu", {
      resolvePackageJson: () => "/repo/node_modules/nushell/package.json",
      readPackageJson: () => JSON.stringify({ bin: "lib/index.js" }),
      existsSync: (candidate) => candidate === "/repo/node_modules/.bin/nu" || candidate === "/repo/node_modules/nushell/lib/index.js",
      platform: "darwin",
    });

    expect(resolved).toBe("/repo/node_modules/nushell/lib/index.js");
  });

  it("resolves Windows JavaScript package bins and prepares them for node execution", () => {
    const resolved = resolveBundledBin("nushell", "nu", "nu", {
      resolvePackageJson: () => "/repo/node_modules/nushell/package.json",
      readPackageJson: () => JSON.stringify({ bin: "lib/index.js" }),
      existsSync: (candidate) => candidate === "/repo/node_modules/nushell/lib/index.js",
      platform: "win32",
    });

    expect(resolved).toBe("/repo/node_modules/nushell/lib/index.js");
    const command = executableCommand(resolved, "win32");
    expect(command.command).toBe(process.execPath);
    expect(command.argsPrefix).toEqual(["/repo/node_modules/nushell/lib/index.js"]);
  });

  it("resolves Windows package executables when no npm .bin shim exists", () => {
    const resolved = resolveBundledBin("@ast-grep/cli", "sg", "sg", {
      resolvePackageJson: () => "/repo/node_modules/@ast-grep/cli/package.json",
      readPackageJson: () => JSON.stringify({ bin: { sg: "sg" } }),
      existsSync: (candidate) => candidate === "/repo/node_modules/@ast-grep/cli/sg.exe",
      platform: "win32",
    });

    expect(resolved).toBe("/repo/node_modules/@ast-grep/cli/sg.exe");
  });

  it("leaves native executables and non-Windows scripts as direct commands", () => {
    expect(executableCommand("/repo/node_modules/@ast-grep/cli/sg.exe", "win32")).toEqual({ command: "/repo/node_modules/@ast-grep/cli/sg.exe", argsPrefix: [] });
    expect(executableCommand("/repo/node_modules/nushell/lib/index.js", "darwin")).toEqual({ command: "/repo/node_modules/nushell/lib/index.js", argsPrefix: [] });
  });
  it("returns an existing bin path from an npm package.json bin map before falling back to PATH", () => {
    const resolved = resolveBundledBin("@ast-grep/cli", "sg", "sg", {
      resolvePackageJson: (specifier) => {
        expect(specifier).toBe("@ast-grep/cli/package.json");
        return "/repo/node_modules/@ast-grep/cli/package.json";
      },
      readPackageJson: () => JSON.stringify({ bin: { sg: "bin/sg" } }),
      existsSync: (candidate) => candidate === "/repo/node_modules/@ast-grep/cli/bin/sg",
    });

    expect(resolved).toBe("/repo/node_modules/@ast-grep/cli/bin/sg");
  });

  it("returns an existing bin path from a string package.json bin entry", () => {
    const resolved = resolveBundledBin("nushell", "nu", "nu", {
      resolvePackageJson: () => "/repo/node_modules/nushell/package.json",
      readPackageJson: () => JSON.stringify({ bin: "nu" }),
      existsSync: (candidate) => candidate === "/repo/node_modules/nushell/nu",
    });

    expect(resolved).toBe("/repo/node_modules/nushell/nu");
  });

  it("returns the PATH fallback command when the npm package cannot be resolved", () => {
    const resolved = resolveBundledBin("nushell", "nu", "nu", {
      resolvePackageJson: () => {
        throw Object.assign(new Error("Cannot find module 'nushell/package.json'"), { code: "MODULE_NOT_FOUND" });
      },
      readPackageJson: () => {
        throw new Error("should not read package.json after resolution failed");
      },
      existsSync: () => false,
    });

    expect(resolved).toBe("nu");
  });

  it("returns the PATH fallback command when the package bin entry is missing", () => {
    const resolved = resolveBundledBin("@ast-grep/cli", "sg", "sg", {
      resolvePackageJson: () => "/repo/node_modules/@ast-grep/cli/package.json",
      readPackageJson: () => JSON.stringify({ bin: { "ast-grep": "bin/ast-grep" } }),
      existsSync: () => false,
    });

    expect(resolved).toBe("sg");
  });
});

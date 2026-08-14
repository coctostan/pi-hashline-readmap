import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const lockRoot = packageLock.packages[""];

describe("Pi 0.84.2 package contract", () => {
  it("uses Pi-hosted wildcard peers and the validated development baseline", () => {
    expect(packageJson.peerDependencies?.typebox).toBe("*");
    expect(packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"]).toBe("*");
    expect(packageJson.peerDependencies?.["@earendil-works/pi-tui"]).toBe("*");
    expect(packageJson.peerDependencies?.["@sinclair/typebox"]).toBeUndefined();

    expect(packageJson.devDependencies?.typebox).toBe("1.3.7");
    expect(packageJson.devDependencies?.["@earendil-works/pi-ai"]).toBe("^0.84.2");
    expect(packageJson.devDependencies?.["@earendil-works/pi-coding-agent"]).toBe("^0.84.2");
    expect(packageJson.devDependencies?.["@earendil-works/pi-tui"]).toBe("^0.84.2");
    expect(packageJson.devDependencies?.["@sinclair/typebox"]).toBeUndefined();

    for (const name of ["typebox", "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"]) {
      expect(packageJson.dependencies?.[name]).toBeUndefined();
      expect(packageJson.bundledDependencies ?? []).not.toContain(name);
    }

    expect(lockRoot.peerDependencies?.typebox).toBe("*");
    expect(lockRoot.peerDependencies?.["@earendil-works/pi-coding-agent"]).toBe("*");
    expect(lockRoot.peerDependencies?.["@earendil-works/pi-tui"]).toBe("*");
    expect(lockRoot.peerDependencies?.["@sinclair/typebox"]).toBeUndefined();
    expect(lockRoot.devDependencies?.typebox).toBe("1.3.7");
    expect(lockRoot.devDependencies?.["@earendil-works/pi-ai"]).toBe("^0.84.2");
    expect(lockRoot.devDependencies?.["@earendil-works/pi-coding-agent"]).toBe("^0.84.2");
    expect(lockRoot.devDependencies?.["@earendil-works/pi-tui"]).toBe("^0.84.2");
    expect(lockRoot.devDependencies?.["@sinclair/typebox"]).toBeUndefined();
    expect(packageLock.packages["node_modules/typebox"]?.version).toBe("1.3.7");

    expect(packageJson.dependencies).toEqual({
      "@repomix/tree-sitter-wasms": "0.1.17",
      diff: "^8.0.3",
      ignore: "^7.0.5",
      nushell: "0.108.0",
      picomatch: "^4.0.4",
      "ts-morph": "^27.0.2",
      "web-tree-sitter": "0.26.11",
      "xxhash-wasm": "^1.1.0",
    });
    expect(packageJson.optionalDependencies).toEqual({ "@ast-grep/cli": "0.42.2" });
    expect(packageJson.devDependencies?.["@types/node"]).toBe("^25.5.0");
    expect(packageJson.devDependencies?.typescript).toBe("^5.9.3");
    expect(packageJson.devDependencies?.vitest).toBe("^4.1.0");
  });
});

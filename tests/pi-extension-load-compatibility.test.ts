import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(resolve(packageRoot, "package-lock.json"), "utf8"));
const piEntryPath = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const installedPiPackage = JSON.parse(
  readFileSync(resolve(dirname(piEntryPath), "..", "package.json"), "utf8"),
);

const requiredTools = ["read", "edit", "grep", "ast_search", "write", "ls", "find", "bash"];
const requiredHandlers = ["tool_call", "context", "tool_result"];
const hostProvidedPeers = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"];

describe("locked Pi extension-loader compatibility", () => {
  it("loads the package manifest and registers the core extension contract", async () => {
    const lockedPiVersion =
      packageLock.packages["node_modules/@earendil-works/pi-coding-agent"]?.version;
    const declaredPiRange =
      packageJson.devDependencies?.["@earendil-works/pi-coding-agent"];

    expect(packageJson.devDependencies?.semver).toBe("7.8.0");
    expect(packageJson.devDependencies?.["@types/semver"]).toBe("7.7.1");

    const semverPackageName = "semver";
    const { satisfies } = await import(semverPackageName) as typeof import("semver");

    expect(packageJson.pi?.extensions).toEqual(["./index.ts"]);
    expect(installedPiPackage.version).toBe(lockedPiVersion);
    expect(satisfies(lockedPiVersion, declaredPiRange)).toBe(true);

    for (const packageName of hostProvidedPeers) {
      expect(packageJson.peerDependencies?.[packageName]).toBe("*");
      expect(packageJson.dependencies?.[packageName]).toBeUndefined();
      expect(packageJson.bundledDependencies ?? []).not.toContain(packageName);
    }

    const sandbox = mkdtempSync(join(tmpdir(), "pi-hashline-extension-load-"));
    const cwd = join(sandbox, "cwd");
    const agentDir = join(sandbox, "agent");
    mkdirSync(cwd);
    mkdirSync(agentDir);

    try {
      const result = await discoverAndLoadExtensions([packageRoot], cwd, agentDir);

      expect(result.errors).toEqual([]);
      expect(result.extensions).toHaveLength(1);

      const extension = result.extensions[0]!;
      expect(extension.resolvedPath).toBe(resolve(packageRoot, "index.ts"));
      expect([...extension.tools.keys()]).toEqual(expect.arrayContaining(requiredTools));

      for (const eventName of requiredHandlers) {
        expect(extension.handlers.get(eventName)?.length).toBeGreaterThan(0);
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
      delete (globalThis as any).__hashlineToolExecutors;
    }
  });
});

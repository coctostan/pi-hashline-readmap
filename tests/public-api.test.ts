import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("public API surface", () => {
  it("exports only the extension factory; the PTC policy is gone (codemode uses tool annotations)", async () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.exports).toEqual({ ".": "./index.ts" });
    expect(pkg.dependencies?.["pi-prompt-assembler"]).toBeUndefined();
    expect(pkg.peerDependencies?.["pi-prompt-assembler"]).toBeUndefined();
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    expect(typeof mod.default).toBe("function");
    expect(Object.keys(mod)).toEqual(["default"]);
  });
});

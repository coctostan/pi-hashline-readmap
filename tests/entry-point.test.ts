import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
describe("extension entry point (AC8)", () => {
  it("index.ts exists", () => {
    expect(existsSync(resolve(root, "index.ts"))).toBe(true);
  });
  it("index.ts default export is a function with one argument", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    expect(typeof mod.default).toBe("function");
    expect(mod.default.length).toBe(1);
  });
  it("index.ts imports read/edit/grep with .js specifiers", () => {
    const source = readFileSync(resolve(root, "index.ts"), "utf8");
    expect(source).toContain('import { registerReadTool } from "./src/read.js";');
    expect(source).toContain('import { registerEditTool } from "./src/edit.js";');
    expect(source).toContain('import { registerGrepTool } from "./src/grep.js";');
  });
  it("registers sg tool", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const tools: string[] = [];
    const mockPi = {
      registerTool(def: any) {
        tools.push(def.name);
      },
    };
    mod.default(mockPi as any);
    expect(tools).toContain("sg");
  });
});
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("index.ts bash shellPath wiring (issue #209)", () => {
  it("imports resolveShellPath from hashline-settings", () => {
    const source = readFileSync(resolve(root, "index.ts"), "utf8");
    expect(source).toContain("resolveShellPath");
    expect(source).toContain('from "./src/hashline-settings.js"');
  });

  it("passes a resolved shellPath into registerBashRendererTool", () => {
    const source = readFileSync(resolve(root, "index.ts"), "utf8");
    expect(source).toMatch(/registerBashRendererTool\(pi,\s*\{[^}]*shellPath/s);
  });

  it("registers the bash tool when loaded", async () => {
    const modImport = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const tools: string[] = [];
    const mockPi = {
      registerTool(def: any) { tools.push(def.name); },
      on() {},
      events: { emit() {}, on() {} },
    };
    modImport.default(mockPi as any);
    expect(tools).toContain("bash");
  });
});

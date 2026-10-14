import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg prompt loading", () => {
  it("uses compact provider-visible metadata and keeps prompt details in prompts/sg.md", async () => {
    const tool = await getSgTool();
    expect(tool.description).toBe("ast-grep search; return anchors.");
    const content = readFileSync(resolve(root, "prompts/sg.md"), "utf8");
    expect(content).toContain("AST-aware structural code search");
  });

  it("keeps structural-search contract details in prompts/sg.md", () => {
    const content = readFileSync(resolve(root, "prompts/sg.md"), "utf8");
    expect(content).toContain("code shape");
    expect(content).toContain("grouped by file");
    expect(content).toContain("hashline anchors");
    expect(content).toContain("$NAME");
    expect(content).toContain("$_");
    expect(content).toContain("$$$ARGS");
    expect(content).toContain("parsed as code, not text");
  });
});

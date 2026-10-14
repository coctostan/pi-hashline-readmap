import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerLsTool } from "../src/ls.js";
import { EXPECTED_TOOL_DESCRIPTIONS } from "./helpers/tool-contract-pins.js";

function firstParagraph(path: string): string {
  const content = readFileSync(path, "utf8").trim();
  return content.split(/\n\s*\n/, 1)[0]?.trim() ?? content;
}

function captureTool(register: (pi: any) => void) {
  let tool: any;
  register({
    registerTool(def: any) {
      tool = def;
    },
  });
  return tool;
}

describe("ls prompt loading", () => {
  it("uses compact provider-visible metadata and keeps prompt details in prompts/ls.md", () => {
    const tool = captureTool(registerLsTool);
    expect(tool.description).toBe(EXPECTED_TOOL_DESCRIPTIONS.ls);
    expect(firstParagraph(resolve("prompts/ls.md"))).toContain("dotfiles are included");
  });

  it("documents single-directory output and routing to find/read", () => {
    const content = readFileSync(resolve("prompts/ls.md"), "utf8");

    expect(content).toContain("List one directory");
    expect(content).toContain("dotfiles are included");
    expect(content).toContain("Output is one entry per line");
    expect(content).toContain("find` for recursive discovery");
    expect(content).toContain("read` for file contents");
  });
});

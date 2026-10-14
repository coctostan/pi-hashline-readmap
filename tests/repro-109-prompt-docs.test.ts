import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerLsTool } from "../src/ls.js";
import { registerFindTool } from "../src/find.js";
import { registerWriteTool } from "../src/write.js";
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

describe("repro 109 — prompt docs alignment", () => {
  it("uses compact descriptions while keeping ls, find, and write prompt docs", () => {
    const lsTool = captureTool(registerLsTool);
    const findTool = captureTool(registerFindTool);
    const writeTool = captureTool(registerWriteTool);

    const lsPrompt = resolve("prompts/ls.md");
    const findPrompt = resolve("prompts/find.md");
    const writePrompt = resolve("prompts/write.md");

    expect(lsTool.description).toBe(EXPECTED_TOOL_DESCRIPTIONS.ls);
    expect(findTool.description).toBe(EXPECTED_TOOL_DESCRIPTIONS.find);
    expect(existsSync(writePrompt)).toBe(true);
    expect(writeTool.description).toBe("Write files; return anchors.");
    expect(firstParagraph(lsPrompt)).toContain("dotfiles are included");
    expect(firstParagraph(findPrompt)).toContain("nested `.gitignore`");
    expect(firstParagraph(writePrompt)).toContain("overwrites existing files");
  });

  it("documents hash mismatch recovery and all valid anchor sources in prompts/edit.md", () => {
    const content = readFileSync(resolve("prompts/edit.md"), "utf8");

    expect(content).toContain("hash mismatch");
    expect(content).toContain(">>>");
    expect(content).toContain("set_line");
    expect(content).toContain("replace_lines");
    expect(content).toContain("insert_after");
    expect(content).toContain("replace");
    expect(content).toContain("read");
    expect(content).toContain("grep");
    expect(content).toContain("ast_search");
    expect(content).toContain("write");
  });
});

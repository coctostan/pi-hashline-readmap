import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { registerWriteTool } from "../src/write.js";

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

describe("prompt loading — write", () => {
  it("uses compact provider-visible metadata and keeps prompt details in prompts/write.md", () => {
    const promptPath = resolve("prompts/write.md");
    expect(existsSync(promptPath)).toBe(true);

    const tool = captureTool(registerWriteTool);
    expect(tool.description).toBe("Write files; return anchors.");
    expect(firstParagraph(promptPath)).toContain("overwrites existing files");
  });

  it("documents overwrite, binary no-anchor behavior, safe display escaping, and best-effort map appends", () => {
    const promptPath = resolve("prompts/write.md");
    const content = readFileSync(promptPath, "utf8");
    expect(content).toContain("overwrites existing files");
    expect(content).toContain("Existing files are overwritten without confirmation");
    expect(content).toContain("no anchors to feed into `edit`");
    expect(content).toContain("control characters");
    expect(content).toMatch(/`map` — optional/i);
    expect(content).toMatch(/map append is best-effort/i);
  });
});

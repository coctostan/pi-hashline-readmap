import { describe, it, expect } from "vitest"; // AC15
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("prompts directory (AC15)", () => {
  it("prompts directory exists", () => {
    expect(existsSync(resolve(root, "prompts"))).toBe(true);
  });

  it("prompts contains at least one .md file", () => {
    const promptsDir = resolve(root, "prompts");
    expect(existsSync(promptsDir)).toBe(true);
    const files = readdirSync(promptsDir);
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
  });

  it("read prompt documents hashlines, truncation map, and image delegation", () => {
    const readPrompt = readFileSync(resolve(root, "prompts/read.md"), "utf8");

    expect(readPrompt).toContain("LINE:HASH|");
    expect(readPrompt).toContain("{{DEFAULT_MAX_LINES}}");
    expect(readPrompt).toContain("{{DEFAULT_MAX_BYTES}}");
    expect(readPrompt).toContain("structural map");
    expect(readPrompt).toContain("read(path, { offset:");
    expect(readPrompt).toContain("17 languages");
    expect(readPrompt).toContain("cached in memory by file modification time");
    expect(readPrompt).toContain("Images");
  });

  it("sg prompt exists and documents metavariables and workflow", () => {
    const sgPromptPath = resolve(root, "prompts/sg.md");
    expect(existsSync(sgPromptPath)).toBe(true);

    const content = readFileSync(sgPromptPath, "utf8");
    expect(content).toContain("$NAME");
    expect(content).toContain("$$$ARGS");
    expect(content).toContain("$_");
    expect(content.toLowerCase()).toContain("workflow");
    expect(content.toLowerCase()).toContain("edit");
  });
});

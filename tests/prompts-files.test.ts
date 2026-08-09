import { describe, it, expect } from "vitest";
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

  it("read prompt documents hashlines, truncation maps, image behavior, and symbol bundles", () => {
    const readPrompt = readFileSync(resolve(root, "prompts/read.md"), "utf8");

    expect(readPrompt).toContain("LINE:HASH|content");
    expect(readPrompt).toContain("{{DEFAULT_MAX_LINES}}");
    expect(readPrompt).toContain("{{DEFAULT_MAX_BYTES}}");
    expect(readPrompt).toContain("structural map");
    expect(readPrompt).toContain("read({ offset, limit })");
    expect(readPrompt).toContain("Images return attachments");
    expect(readPrompt).toContain("bundle: \"local\"");
    expect(readPrompt).toContain("fuzzy-symbol-match");
    expect(readPrompt).toContain("omittedSelectors");
  });

  it("sg prompt documents limits, final budgets, structured retention, and guidance", () => {
    const sgPromptPath = resolve(root, "prompts/sg.md");
    expect(existsSync(sgPromptPath)).toBe(true);
    const content = readFileSync(sgPromptPath, "utf8");

    expect(content).toContain("$NAME");
    expect(content).toContain("$$$ARGS");
    expect(content).toContain("$_");
    expect(content).toContain("positive integer");
    expect(content).toContain("default 100");
    expect(content).toContain("raw ast-grep match records");
    expect(content).toContain("complete returned visible text");
    expect(content).toContain("complete merged blocks");
    expect(content).toContain("`ptcValue.files` retains every range and line admitted by the result limit");
    expect(content).toContain("Narrow path/pattern or increase limit");
    expect(content.toLowerCase()).toContain("edit");
  });
});

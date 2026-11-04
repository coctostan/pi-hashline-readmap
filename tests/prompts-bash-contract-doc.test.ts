import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(__dirname, "..", "prompts", "bash.md");

describe("prompts/bash.md — bash output contract doc", () => {
  it("says the model reads Pi's output, ANSI stripped, plus hints", () => {
    const content = readFileSync(docPath, "utf8");
    expect(content).toContain("Pi's own bash output with ANSI escape codes stripped");
    expect(content).toContain("[Hint: Prefer the grep tool for content search.]");
    expect(content).toContain("structuredContent");
  });

  it("names no compaction", () => {
    const content = readFileSync(docPath, "utf8");
    expect(content).not.toMatch(/RTK|compress/i);
  });
});

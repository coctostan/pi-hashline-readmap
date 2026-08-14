import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const promptFiles = ["read", "edit", "grep", "find", "ls", "write", "sg", "nu"];
describe("tool prompt reference role", () => {
  it("marks all full prompt bodies as detailed references to provider metadata", () => {
    for (const name of promptFiles) {
      const text = readFileSync(`prompts/${name}.md`, "utf8");
      expect(text, name).toContain("Detailed reference document");
      expect(text, name).toContain("../docs/tool-metadata.md");
      expect(text, name).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    }
  });

  it("keeps post-248 and tool-specific constraints accurate", () => {
    const read = readFileSync("prompts/read.md", "utf8");
    expect(read).toContain("May combine with `limit`, `map: true`, and `bundle: \"local\"`");
    expect(read).toContain("cannot combine with `offset`");
    expect(read).toContain("cannot be used without `symbol`");
    expect(readFileSync("prompts/edit.md", "utf8")).toContain("Each `edits[]` entry must contain exactly one variant key");
    expect(readFileSync("prompts/grep.md", "utf8")).toContain("requires `scope: \"symbol\"`");
    expect(readFileSync("prompts/ls.md", "utf8")).toContain("brackets and braces must be balanced");
    expect(readFileSync("prompts/write.md", "utf8")).toContain("bare carriage returns");
    expect(readFileSync("prompts/sg.md", "utf8")).toContain("positive integer maximum");
    const nu = readFileSync("prompts/nu.md", "utf8");
    expect(nu).toContain("default 30");
    expect(nu).not.toMatch(/timeout[^\n]*(?:positive|non-negative)/i);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ast_search prompt reference role", () => {
  it("points to provider metadata and preserves structural-pattern limits", () => {
    const text = readFileSync("prompts/sg.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("ast-grep pattern");
    expect(text).toContain("positive integer maximum");
  });
});

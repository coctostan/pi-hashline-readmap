import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("nu prompt reference role", () => {
  it("points to provider metadata without inventing timeout constraints", () => {
    const text = readFileSync("prompts/nu.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("Nushell script");
    expect(text).toContain("default 30");
    expect(text).not.toMatch(/timeout[^\n]*(?:positive|non-negative)/i);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ls prompt reference role", () => {
  it("points to provider metadata and documents balanced globs", () => {
    const text = readFileSync("prompts/ls.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("brackets and braces must be balanced");
  });
});

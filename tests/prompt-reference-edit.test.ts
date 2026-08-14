import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("edit prompt reference role", () => {
  it("points to provider metadata and preserves edit validation", () => {
    const text = readFileSync("prompts/edit.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("Each `edits[]` entry must contain exactly one variant key");
    expect(text).toContain("new_body` must not be empty or whitespace-only");
  });
});

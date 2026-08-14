import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("grep prompt reference role", () => {
  it("points to provider metadata and preserves scope/summary rules", () => {
    const text = readFileSync("prompts/grep.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("`summary: true`: return per-file match counts only — no line content or anchors.");
    expect(text).toContain("requires `scope: \"symbol\"`");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("write prompt reference role", () => {
  it("points to provider metadata and distinguishes bare-CR and binary behavior", () => {
    const text = readFileSync("prompts/write.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("bare carriage returns");
    expect(text).toContain("no anchors to feed into `edit`");
    expect(text).toContain("complete file contents");
    expect(text).toContain("append a structural map");
  });
});

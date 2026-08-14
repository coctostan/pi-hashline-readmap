import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("find prompt reference role", () => {
  it("points to provider metadata and preserves regex/date/size forms", () => {
    const text = readFileSync("prompts/find.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("JavaScript regex against each basename");
    expect(text).toContain("ISO date/time or relative age");
    expect(text).toContain("`KB`, `MB`, `GB`");
  });
});

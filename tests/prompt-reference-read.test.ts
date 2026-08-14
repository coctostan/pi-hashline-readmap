import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("read prompt reference role", () => {
  it("points to provider metadata and preserves post-248 composition", () => {
    const text = readFileSync("prompts/read.md", "utf8");
    expect(text).toContain("Detailed reference document");
    expect(text).toContain("../docs/tool-metadata.md");
    expect(text).toContain("Changing this prompt body alone does not change provider-visible metadata.");
    expect(text).toContain("This file is not loaded into `session.systemPrompt`.");
    expect(text).toContain("May combine with `limit`, `map: true`, and `bundle: \"local\"");
    expect(text).toContain("cannot combine with `offset`");
    expect(text).toContain("cannot be used without `symbol`");
  });
});

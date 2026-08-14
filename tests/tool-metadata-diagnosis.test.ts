import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("tool metadata diagnosis", () => {
  it("records the inventory, provider boundary, measured baseline, and observational follow-up", () => {
    const doc = readFileSync("docs/tool-metadata.md", "utf8");
    for (const text of ["2,665 sessions", "17,072 `read` calls", "43 ambiguous calls", "27 sessions", "eight model routes", "approximately 0.25%", "approximately 1.3%", "36 of 43", "0.71%", "2.60%", "correlational", "changed model mix", "observational follow-up", "not a 0.13.0 release gate", "scripts/scan-ambiguous-read-calls.mjs", "compact descriptions", "Prompt snippets and guidelines", "full `prompts/*.md` bodies", "do not reach the provider", "[Back to README](../README.md)"]) expect(doc, text).toContain(text);
    for (const tool of ["read", "edit", "grep", "ast_search", "write", "ls", "find", "nu"]) expect(doc).toContain(`| \`${tool}\` |`);
    expect(doc).toContain("symbol may combine with `limit`, `map`, and `bundle: \"local\"`");
    expect(doc).toContain("`scopeContext` requires `scope: \"symbol\"`");
    expect(doc).toContain("balanced brackets and braces"); expect(doc).toContain("B, K, KB, M, MB, G, GB");
    expect(doc).toContain("~/.pi/agent/sessions");
    expect(doc).toContain("recursively");
    expect(doc).toContain("malformed assistant content");
  });
});

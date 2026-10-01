import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("integration reference", () => {
  it("retains codemode, annotations, and provider-visible prompt contracts", () => {
    const text = readFileSync("docs/integrations.md", "utf8");
    expect(text).toContain("pi-hashline-readmap"); expect(text).toContain("[Back to README](../README.md)");
    for (const value of [
      "codemode",
      "ctx.executeTool()",
      "annotations",
      "context_hygiene_report",
      "promptSnippet",
      "promptGuidelines",
      "full prompt documents",
      "do not become provider-visible",
      "tool-metadata.md",
      "pi-prompt-assembler",
      "may optionally consume",
      "createAgentSession",
    ]) expect(text, value).toContain(value);
    expect(text).toContain("were removed");
  });
});

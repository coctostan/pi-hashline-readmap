import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("long-line window documentation — references", () => {
  it("documents the window params, defaults, ceiling, combinations and marker in prompts/read.md", () => {
    const text = readFileSync("prompts/read.md", "utf8");
    expect(text).toContain("`charOffset`");
    expect(text).toContain("`charLimit`");
    expect(text).toContain("default 500");
    expect(text).toContain("10,000");
    expect(text).toContain("cannot combine with `symbol`, `bundle`, or `map`");
    expect(text).toContain("`char-offset-past-end`");
    expect(text).toContain("... [truncated, N chars total; read({offset:L, charOffset:K})]");
  });

  it("documents the ptcValue window field", () => {
    const text = readFileSync("docs/structured-output.md", "utf8");
    expect(text).toContain("`window`");
    expect(text).toContain("`nextCharOffset`");
  });

  it("lists the new parameter descriptions as provider-visible constraints", () => {
    const text = readFileSync("docs/tool-metadata.md", "utf8");
    expect(text).toContain("`charOffset`");
    expect(text).toContain("`charLimit`");
  });
});

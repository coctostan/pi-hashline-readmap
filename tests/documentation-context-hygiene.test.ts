import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("context-hygiene reference", () => {
  it("is self-contained and retains stale, retirement, guard, and rehydration contracts", () => {
    const text = readFileSync("docs/context-hygiene.md", "utf8");
    expect(text).toContain("pi-hashline-readmap"); expect(text).toContain("[Back to README](../README.md)");
    for (const value of ["read-context", "search-context", "command-output", "mutation-after-read", "same-command-success-rerun", "forward-only", "file-not-read", "hash-mismatch", "PI_CONTEXT_HYGIENE_DEBUG=1", "rehydrate"]) expect(text, value).toContain(value);
    expect(text).toContain("**Hard guards at the point of use.** `edit` refuses with `file-not-read` when the tracked read");
  });
});

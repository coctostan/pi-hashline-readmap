import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const structured = readFileSync("docs/structured-output.md", "utf8");
const integrations = readFileSync("docs/integrations.md", "utf8");
describe("relocated PTC and executor documentation", () => {
  it("keeps policy rows in structured-output.md", () => {
    expect(structured).toContain("`HASHLINE_TOOL_PTC_POLICY`");
    expect(structured).toContain("`read` | `read` | Yes | `read-only` | `safe-by-default`");
    expect(structured).toContain("`ast_search` | `ast_search` | No | `read-only` | `opt-in`");
    expect(structured).toContain("`edit` | `edit` | Yes | `mutating` | `not-safe-by-default`");
  });
  it("keeps executor exposure, optional nu, and policy-consumer guidance in integrations.md", () => {
    expect(integrations).toContain('pi.events.emit("hashline:tool-executors"');
    expect(integrations).toContain("__hashlineToolExecutors");
    for (const tool of ["read", "edit", "grep", "ast_search", "write", "ls", "find"]) expect(integrations).toContain(`\`${tool}\``);
    expect(integrations).toContain("Present only when the optional Nushell integration registers successfully");
    expect(integrations).toContain("pi-prompt-assembler");
    expect(integrations).toContain("HASHLINE_TOOL_PTC_POLICY");
  });
});

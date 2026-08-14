import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("Bash output reference", () => {
  it("is self-contained and retains compression, recovery, and result contracts", () => {
    const text = readFileSync("docs/bash-output.md", "utf8");
    expect(text).toContain("pi-hashline-readmap"); expect(text).toContain("[Back to README](../README.md)");
    for (const value of ["RTK route compression", "Bash context guard", "PI_RTK_BYPASS=1", "PI_HASHLINE_BASH_CONTEXT_GUARD=0", "Original/pre-RTK output", "details.rtkCompaction", "details.ptcValue.rtkCompaction", "0600"]) expect(text, value).toContain(value);
    expect(text).toContain("the `Original/pre-RTK output` path for command output before route compression.");
  });
});

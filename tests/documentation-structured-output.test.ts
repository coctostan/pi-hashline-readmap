import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("structured-output reference", () => {
  it("retains editing, reads, writes, structural search, exploration, and PTC policy", () => {
    const text = readFileSync("docs/structured-output.md", "utf8");
    expect(text).toContain("pi-hashline-readmap"); expect(text).toContain("[Back to README](../README.md)");
    for (const value of [
      "never include `LINE:HASH|`",
      "strips them defensively",
      "Set `new_text` to `\"\"` to delete",
      "not approximate or semantic matching",
      "overlapping-edit",
      "one-line replacement plus `insert_after`",
      "sharing the same resolved anchor",
      "atomically",
      "Hard-linked targets",
      "Existing files keep their permission mode",
      "newly created files",
      "replace_symbol",
      "TypeScript, JavaScript, Rust, and Java",
      "Rust, C++, C headers, and Java",
      "Existing syntax errors are tolerated",
      "PI_HASHLINE_SYNTAX_VALIDATE",
      "raw ast-grep match records",
      "Blocks are admitted whole",
      "anchored lines from omitted AST matches",
      "`ls` lists one directory",
      "`find` matches basenames",
      "pattern containing `/`",
      "includes hidden files",
      "details.ptcValue",
      "PtcError",
      "HASHLINE_TOOL_PTC_POLICY",
      "jpg`, `jpeg`, `png`, `gif`, and `webp",
      "magic bytes",
      "creates parent directories automatically",
      "requested symbol, local support, then full-file map",
      "textual `+`/`-`/space gutter markers",
      "functions, classes, methods, interfaces, type aliases, constants, and enums",
      "literal and regex search",
      "`scopeContext: 0`",
    ]) expect(text, value).toContain(value);
  });
});

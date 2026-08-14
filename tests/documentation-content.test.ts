import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const load = (name: string) => readFileSync(`docs/${name}.md`, "utf8");
describe("extracted documentation homes", () => {
  it("keeps each advanced document self-contained and linked back", () => {
    for (const name of ["bash-output", "context-hygiene", "integrations", "structured-output", "configuration", "tool-metadata"]) {
      const text = load(name);
      expect(text, name).toContain("pi-hashline-readmap");
      expect(text, name).toContain("[Back to README](../README.md)");
    }
  });

  it("preserves Bash recovery and context-hygiene contracts", () => {
    const bash = load("bash-output");
    for (const value of ["RTK route compression", "Bash context guard", "PI_RTK_BYPASS=1", "PI_HASHLINE_BASH_CONTEXT_GUARD=0", "Original/pre-RTK output", "details.rtkCompaction", "details.ptcValue.rtkCompaction", "0600"]) expect(bash, value).toContain(value);
    const hygiene = load("context-hygiene");
    for (const value of ["read-context", "search-context", "command-output", "mutation-after-read", "same-command-success-rerun", "forward-only", "file-not-read", "hash-mismatch", "PI_CONTEXT_HYGIENE_DEBUG=1", "rehydrate"]) expect(hygiene, value).toContain(value);
  });

  it("preserves configuration, mapper, settings, and GDScript contracts", () => {
    const text = load("configuration");
    for (const value of ["@ast-grep/cli", "Termux/Android", "musl-based Linux", "ast-grep` on `PATH`", "ast-grep not available", "universal-ctags", "difftastic", "web-tree-sitter` 0.26", "@repomix/tree-sitter-wasms", "C/C++ headers share the C++ mapper", "no native tree-sitter packages", "paths containing shell metacharacters", "argv-safe", "environment variables remain supported", "not deprecated", "$XDG_CACHE_HOME/pi-hashline-readmap/maps", "above-default values are clamped", "case-insensitive", "surrounding whitespace trimmed", "pi's own configured `shellPath`", "negative, signed, decimal, hexadecimal, exponent notation", "Boolean fields must be JSON booleans", "Malformed JSON", "PI_NUSHELL_CONFIG", "Migration example", "pip install gdtoolkit", "python3", "PI_HASHLINE_GDSCRIPT=1"]) expect(text, value).toContain(value);
  });

  it("preserves editing, structural search, exploration, and structured-output contracts", () => {
    const text = load("structured-output");
    for (const value of ["never include `LINE:HASH|`", "strips them defensively", "Set `new_text` to `\"\"` to delete", "not approximate or semantic matching", "overlapping-edit", "one-line replacement plus `insert_after`", "sharing the same resolved anchor", "atomically", "hard-linked targets", "Existing files keep their permission mode", "newly created files", "replace_symbol", "TypeScript, JavaScript, Rust, and Java", "Rust, C++, C headers, and Java", "Existing syntax errors are tolerated", "raw ast-grep match records", "Blocks are admitted whole", "anchored lines from omitted AST matches", "`ls` lists one directory", "`find` matches basenames", "pattern containing `/`", "includes hidden files", "details.ptcValue", "PtcError", "HASHLINE_TOOL_PTC_POLICY", "magic bytes", "creates parent directories automatically", "requested symbol, local support, then full-file map", "textual `+`/`-`/space gutter markers", "functions, classes, methods, interfaces, type aliases, constants, and enums", "literal and regex search", "`scopeContext: 0`"]) expect(text, value).toContain(value);
  });

  it("preserves executor and provider-boundary integration contracts", () => {
    const text = load("integrations");
    for (const value of ["hashline:tool-executors", "__hashlineToolExecutors", "context_hygiene_report", "promptSnippet", "promptGuidelines", "full prompt documents", "do not become provider-visible", "tool-metadata.md", "pi-prompt-assembler", "may optionally consume", "HASHLINE_TOOL_PTC_POLICY"]) expect(text, value).toContain(value);
  });
});

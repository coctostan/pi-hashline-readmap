import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("README.md content (AC-1, AC-2)", () => {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");

  it("documents the read tool with LINE:HASH format", () => {
    expect(readme).toContain("LINE:HASH");
    expect(readme).toContain("`read`");
  });

  it("documents the edit tool", () => {
    expect(readme).toContain("`edit`");
    expect(readme).toContain("set_line");
  });

  it("documents the grep tool", () => {
    expect(readme).toContain("`grep`");
  });

  it("documents the write tool", () => {
    expect(readme).toContain("`write`");
    expect(readme).toContain("Create a new file with `write`");
  });

  it("explains why this extension exists (conflict resolution)", () => {
    expect(readme).toContain("conflict");
  });

  it("uses stable validation guidance instead of session-specific snapshot text", () => {
    expect(readme).not.toContain("Current repository snapshot verified in this session");
    expect(readme).toContain("Before publishing or opening a PR, run the workspace checks above from a clean checkout");
  });

  it("uses package-safe links for repo-only assets and docs", () => {
    expect(readme).toContain("https://raw.githubusercontent.com/coctostan/pi-hashline-readmap/main/banner.png");
    expect(readme).toContain("https://github.com/coctostan/pi-hashline-readmap/blob/main/AGENTS.md");
    expect(readme).toContain("https://github.com/coctostan/pi-hashline-readmap/blob/main/docs/exploratory-functional-testing.md");
  });

  it("does not document obsolete native tree-sitter install caveats or Clojure support", () => {
    expect(readme).not.toContain("tree-sitter peer dependencies");
    expect(readme).not.toContain("tree-sitter-cpp and tree-sitter-java");
    expect(readme).not.toContain("widen their peer ranges upstream");
    expect(readme).not.toContain("Clojure");
    expect(readme).toContain("Rust, C++, and Java structural maps use `web-tree-sitter` with packaged `tree-sitter-wasms` grammars");
    expect(readme).toContain("no native tree-sitter packages are installed for those mappers");
  });

  it("documents the edit.diffDisplay setting and PI_HASHLINE_EDIT_DIFF_DISPLAY env override", () => {
    expect(readme).toContain("edit.diffDisplay");
    expect(readme).toContain("PI_HASHLINE_EDIT_DIFF_DISPLAY");
    expect(readme).toContain("`collapsed`");
    expect(readme).toContain("`expanded`");
    expect(readme).toContain("Defaults to `collapsed`");
    expect(readme).toMatch(/case-insensitive/i);
  });

  it("documents edit new_text safety, deletion, and fuzzy semantics", () => {
    expect(readme).toContain("never include `LINE:HASH|`");
    expect(readme).toContain('Set `new_text` to `""` to delete');
    expect(readme).toContain("not approximate or semantic matching");
  });
});

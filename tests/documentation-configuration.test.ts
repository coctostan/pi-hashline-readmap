import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("configuration reference", () => {
  it("retains current CLI, mapper, settings, fallback, and GDScript contracts", () => {
    const text = readFileSync("docs/configuration.md", "utf8");
    expect(text).toContain("pi-hashline-readmap"); expect(text).toContain("[Back to README](../README.md)");
    for (const value of [
      "@ast-grep/cli",
      "Termux/Android",
      "musl-based Linux",
      "ast-grep` on `PATH`",
      "ast-grep not available",
      "universal-ctags",
      "difftastic",
      "web-tree-sitter` 0.26",
      "@repomix/tree-sitter-wasms",
      "C/C++ headers share the C++ mapper",
      "no native tree-sitter packages",
      "paths containing shell metacharacters",
      "argv-safe",
      "environment variables remain supported",
      "not deprecated",
      "~/.pi/agent/hashline-readmap/settings.json",
      "<repo>/.pi/hashline-readmap/settings.json",
      "environment variables > project JSON > global JSON > built-in defaults",
      "~/.pi/agent/settings.json",
      "<repo>/.pi/settings.json",
      "~/.pi/hashline-readmap/settings.json",
      "<repo>/.pi/hashline-readmap.json",
      "grep.maxLines",
      "mapCache.enabled",
      "bashContextGuard.enabled",
      "edit.diffDisplay",
      "display.previewLines",
      "bash.shellPath",
      "$XDG_CACHE_HOME/pi-hashline-readmap/maps",
      "~/.cache/pi-hashline-readmap/maps",
      "above-default values are clamped",
      "case-insensitive",
      "surrounding whitespace trimmed",
      "pi's own configured `shellPath`",
      "negative, signed, decimal, hexadecimal, exponent notation",
      "Boolean fields must be JSON booleans",
      "mapCache.dir must be a non-empty string",
      "Malformed JSON",
      "PI_NUSHELL_CONFIG",
      "~/.config/pi/nushell/config.nu",
      "Migration example",
      "pip install gdtoolkit",
      "python3",
      "PI_HASHLINE_GDSCRIPT=1",
      "gdtoolkit.parser",
    ]) expect(text, value).toContain(value);
    expect(text).toContain("Durable environment overrides can move into project JSON");
  });
});

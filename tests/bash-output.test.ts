import { describe, expect, it } from "vitest";
import { presentBashOutput } from "../src/bash-output.js";

describe("presentBashOutput", () => {
  it("returns Pi's text as given, ANSI stripped, for any command", () => {
    const log = Array.from({ length: 25 }, (_, i) => `commit ${i}\n\n    change ${i}`).join("\n");
    expect(presentBashOutput("git log -25", log)).toBe(log);
    expect(presentBashOutput("npm run build", "\x1b[31merror\x1b[0m TS2322\n")).toBe("error TS2322\n");
    expect(presentBashOutput("ls -la", "a\nb\n")).toBe("a\nb\n");
  });

  it("appends the anti-pattern hint after a blank line", () => {
    expect(presentBashOutput("rg foo", "src/a.ts:1:foo")).toBe(
      "src/a.ts:1:foo\n\n[Hint: Prefer the grep tool for content search.]",
    );
    expect(presentBashOutput("find . -name '*.ts'", "./a.ts")).toBe(
      "./a.ts\n\n[Hint: Prefer the dedicated file-search tools for repository discovery.]",
    );
  });

  it("returns the hint alone on empty text", () => {
    expect(presentBashOutput("rg foo", "")).toBe("[Hint: Prefer the grep tool for content search.]");
    expect(presentBashOutput("echo", "")).toBe("");
  });
});

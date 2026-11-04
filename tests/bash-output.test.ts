import { describe, expect, it } from "vitest";
import { presentBashOutput } from "../src/bash-output.js";

const ALL = ["read", "bash", "edit", "write", "grep", "find", "ls"];

describe("presentBashOutput", () => {
  it("returns Pi's text as given, ANSI stripped, for any command", () => {
    const log = Array.from({ length: 25 }, (_, i) => `commit ${i}\n\n    change ${i}`).join("\n");
    expect(presentBashOutput("git log -25", log, ALL)).toBe(log);
    expect(presentBashOutput("npm run build", "\x1b[31merror\x1b[0m TS2322\n", ALL)).toBe("error TS2322\n");
    expect(presentBashOutput("ls -la", "a\nb\n", ALL)).toBe("a\nb\n");
  });

  it("appends the anti-pattern hint after a blank line", () => {
    expect(presentBashOutput("rg foo", "src/a.ts:1:foo", ALL)).toBe(
      "src/a.ts:1:foo\n\n[Hint: Prefer the grep tool for content search.]",
    );
    expect(presentBashOutput("find . -name '*.ts'", "./a.ts", ALL)).toBe(
      "./a.ts\n\n[Hint: Prefer the dedicated file-search tools for repository discovery.]",
    );
  });

  it("appends no hint naming an inactive tool", () => {
    const active = ALL.filter((name) => name !== "grep" && name !== "find");
    expect(presentBashOutput("rg foo", "src/a.ts:1:foo", active)).toBe("src/a.ts:1:foo");
    expect(presentBashOutput("find . -name '*.ts'", "./a.ts", active)).toBe("./a.ts");
  });

  it("returns the hint alone on empty text", () => {
    expect(presentBashOutput("rg foo", "", ALL)).toBe("[Hint: Prefer the grep tool for content search.]");
    expect(presentBashOutput("echo", "", ALL)).toBe("");
  });
});

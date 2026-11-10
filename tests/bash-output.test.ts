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

  it("names bash's timeout parameter when the shell has no timeout, whatever tools are active", () => {
    const missing = "/bin/bash: line 1: timeout: command not found\n\nCommand exited with code 127";
    const hint = "[Hint: This shell has no `timeout` command; set the bash tool's `timeout` parameter (seconds) instead.]";
    expect(presentBashOutput("timeout 5 npm test", missing, ALL)).toBe(`${missing}\n\n${hint}`);
    expect(presentBashOutput("timeout 5 npm test", missing, [])).toBe(`${missing}\n\n${hint}`);
    expect(presentBashOutput("timeout 5 rg foo", missing, ALL)).toBe(
      `${missing}\n\n[Hint: Prefer the grep tool for content search.]\n\n${hint}`,
    );
    expect(presentBashOutput("timeout 5 npm test", "ok\n", ALL)).toBe("ok\n");
  });
});

import { describe, it, expect } from "vitest";
import { presentBashOutput } from "../src/bash-output.js";

const ALL = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const without = (...names: string[]) => ALL.filter((name) => !names.includes(name));

describe("bash anti-pattern hints", () => {
  it("adds a cat hint", () => {
    expect(presentBashOutput("cat src/read.ts", "file body", ALL)).toContain("Prefer the read tool");
  });

  it("adds grep and rg hints", () => {
    expect(presentBashOutput("grep -n hashline src/read.ts", "grep body", ALL)).toContain("Prefer the grep tool");
    expect(presentBashOutput("rg hashline src", "rg body", ALL)).toContain("Prefer the grep tool");
  });

  it("adds a sed inspection hint", () => {
    expect(presentBashOutput("sed -n '1,20p' src/read.ts", "sed body", ALL)).toContain(
      "Prefer the read tool for file inspection and the edit tool for changes.",
    );
  });

  it("adds a find repo-discovery hint", () => {
    expect(presentBashOutput("find src -name '*.ts'", "src/read.ts", ALL)).toContain(
      "Prefer the dedicated file-search tools for repository discovery.",
    );
  });

  it("appends the cat hint without replacing the output", () => {
    const out = presentBashOutput("cat src/read.ts", "file body", ALL);
    expect(out).toContain("file body");
    expect(out).toContain("Prefer the read tool");
  });

  it("leaves unrelated commands unchanged", () => {
    expect(presentBashOutput("echo hello", "hello", ALL)).toBe("hello");
  });

  it("names no inactive tool", () => {
    expect(presentBashOutput("rg foo", "rg body", without("grep"))).toBe("rg body");
    expect(presentBashOutput("grep -n foo a.ts", "grep body", without("grep"))).toBe("grep body");
    expect(presentBashOutput("find src -name '*.ts'", "src/a.ts", without("find"))).toBe("src/a.ts");
    expect(presentBashOutput("cat a.ts", "body", without("read"))).toBe("body");
    expect(presentBashOutput("sed -n '1,2p' a.ts", "body", without("edit"))).toBe("body");
  });

  it("names no tool when the active set is unknown", () => {
    expect(presentBashOutput("rg foo", "rg body", [])).toBe("rg body");
  });

  it("falls through to the next hint whose tools are active", () => {
    expect(presentBashOutput("cat a.ts | grep foo", "foo", without("read"))).toBe(
      "foo\n\n[Hint: Prefer the grep tool for content search.]",
    );
  });
});

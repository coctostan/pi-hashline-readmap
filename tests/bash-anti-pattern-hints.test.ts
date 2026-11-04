import { describe, it, expect } from "vitest";
import { presentBashOutput } from "../src/bash-output.js";

describe("bash anti-pattern hints", () => {
  it("adds a cat hint", () => {
    expect(presentBashOutput("cat src/read.ts", "file body")).toContain("Prefer the read tool");
  });

  it("adds grep and rg hints", () => {
    expect(presentBashOutput("grep -n hashline src/read.ts", "grep body")).toContain("Prefer the grep tool");
    expect(presentBashOutput("rg hashline src", "rg body")).toContain("Prefer the grep tool");
  });

  it("adds a sed inspection hint", () => {
    expect(presentBashOutput("sed -n '1,20p' src/read.ts", "sed body")).toContain(
      "Prefer the read tool for file inspection and the edit tool for changes.",
    );
  });

  it("adds a find repo-discovery hint", () => {
    expect(presentBashOutput("find src -name '*.ts'", "src/read.ts")).toContain(
      "Prefer the dedicated file-search tools for repository discovery.",
    );
  });

  it("appends the cat hint without replacing the output", () => {
    const out = presentBashOutput("cat src/read.ts", "file body");
    expect(out).toContain("file body");
    expect(out).toContain("Prefer the read tool");
  });

  it("leaves unrelated commands unchanged", () => {
    expect(presentBashOutput("echo hello", "hello")).toBe("hello");
  });
});

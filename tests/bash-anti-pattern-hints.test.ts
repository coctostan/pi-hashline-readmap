import { describe, it, expect } from "vitest";
import { getBashAntiPatternHint } from "../src/rtk/bash-anti-pattern-hints.js";

describe("bash anti-pattern hints", () => {
  it("suggests read for cat", () => {
    expect(getBashAntiPatternHint("cat src/read.ts")).toContain("Prefer the read tool");
  });

  it("suggests grep for grep and rg", () => {
    expect(getBashAntiPatternHint("grep -n hashline src/read.ts")).toContain("Prefer the grep tool");
    expect(getBashAntiPatternHint("rg hashline src")).toContain("Prefer the grep tool");
  });

  it("suggests read and edit for sed inspection", () => {
    expect(getBashAntiPatternHint("sed -n '1,20p' src/read.ts")).toContain(
      "Prefer the read tool for file inspection and the edit tool for changes.",
    );
  });

  it("suggests dedicated discovery tools for find", () => {
    expect(getBashAntiPatternHint("find src -name '*.ts'")).toContain(
      "Prefer the dedicated file-search tools for repository discovery.",
    );
  });

  it("returns null for unrelated commands", () => {
    expect(getBashAntiPatternHint("echo hello")).toBeNull();
  });
});

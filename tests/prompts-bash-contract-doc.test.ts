import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docPath = resolve(__dirname, "..", "prompts", "bash.md");

describe("prompts/bash.md — rtkCompaction contract doc", () => {
  it("exists", () => {
    expect(existsSync(docPath)).toBe(true);
  });

  it("documents every RtkCompaction field and the contract guarantees", () => {
    const content = readFileSync(docPath, "utf8");
    for (const term of [
      "rtkCompaction",
      "RtkCompaction",
      "applied",
      "techniques",
      "truncated",
      "dropped",
      "originalLineCount",
      "compactedLineCount",
      "details.ptcValue",
      "bashContextGuard",
    ]) {
      expect(content).toContain(term);
    }
    // The "had the opportunity to run" guarantee must be stated.
    expect(content.toLowerCase()).toMatch(/opportunity|chance/);
    // The exclusion of bashContextGuard trimming from truncated must be explicit.
    expect(content).toMatch(/bashContextGuard[\s\S]{0,200}truncated|truncated[\s\S]{0,200}bashContextGuard/);
  });
});

import { describe, it, expect } from "vitest";
import { formatGrepCallText, formatGrepResultText } from "../src/grep-render-helpers.js";

describe("formatGrepCallText", () => {
  it("returns pattern only when no path or glob", () => {
    const result = formatGrepCallText({ pattern: "TODO" });
    expect(result).toEqual({ pattern: "TODO", suffix: undefined });
  });

  it("includes path when not '.'", () => {
    const result = formatGrepCallText({ pattern: "TODO", path: "src/utils" });
    expect(result).toEqual({ pattern: "TODO", suffix: "src/utils" });
  });

  it("excludes path when it is '.'", () => {
    const result = formatGrepCallText({ pattern: "TODO", path: "." });
    expect(result).toEqual({ pattern: "TODO", suffix: undefined });
  });

  it("includes glob", () => {
    const result = formatGrepCallText({ pattern: "TODO", glob: "*.ts" });
    expect(result).toEqual({ pattern: "TODO", suffix: "*.ts" });
  });

  it("includes both path and glob", () => {
    const result = formatGrepCallText({ pattern: "TODO", path: "src", glob: "*.ts" });
    expect(result).toEqual({ pattern: "TODO", suffix: "src *.ts" });
  });

  it("returns empty pattern for missing args", () => {
    const result = formatGrepCallText({});
    expect(result).toEqual({ pattern: "", suffix: undefined });
  });
});

describe("formatGrepResultText", () => {
  it("returns match and file count for normal results", () => {
    const result = formatGrepResultText({
      totalMatches: 42,
      summary: false,
      records: new Array(42).fill(null),
      fileCount: 8,
    });
    expect(result.summary).toBe("✓ 42 matches in 8 files");
    expect(result.badges).toEqual([]);
    expect(result.noMatches).toBe(false);
  });

  it("returns no-matches indicator for zero matches", () => {
    const result = formatGrepResultText({
      totalMatches: 0,
      summary: false,
      records: [],
      fileCount: 0,
    });
    expect(result.noMatches).toBe(true);
  });

  it("shows truncation badge when totalMatches >= 50", () => {
    const result = formatGrepResultText({
      totalMatches: 50,
      summary: false,
      records: new Array(50).fill(null),
      fileCount: 12,
    });
    expect(result.badges).toContain("10/file cap");
    expect(result.truncated).toBe(true);
  });

  it("shows summary badge when summary is true", () => {
    const result = formatGrepResultText({
      totalMatches: 10,
      summary: true,
      records: [],
      fileCount: 3,
    });
    expect(result.badges).toContain("summary");
  });

  it("shows binary badge when hasBinaryWarning is true", () => {
    const result = formatGrepResultText({
      totalMatches: 0,
      summary: false,
      records: [],
      fileCount: 0,
      hasBinaryWarning: true,
    });
    expect(result.badges).toContain("⚠ binary");
  });

  it("singularizes match and file for count of 1", () => {
    const result = formatGrepResultText({
      totalMatches: 1,
      summary: false,
      records: [null as any],
      fileCount: 1,
    });
    expect(result.summary).toBe("✓ 1 match in 1 file");
  });

  it("returns error text when isError is true", () => {
    const result = formatGrepResultText({
      totalMatches: 0,
      summary: false,
      records: [],
      fileCount: 0,
      isError: true,
      errorText: "Invalid regex pattern",
    });
    expect(result.errorText).toBe("Invalid regex pattern");
  });
});

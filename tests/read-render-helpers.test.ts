import { describe, it, expect } from "vitest";
import { formatReadCallText, formatReadResultText } from "../src/read-render-helpers.js";

describe("formatReadCallText", () => {
  it("returns path only when no symbol or map", () => {
    const result = formatReadCallText({ path: "src/foo.ts" });
    expect(result).toEqual({ path: "src/foo.ts", suffix: undefined });
  });

  it("returns symbol suffix when symbol is present", () => {
    const result = formatReadCallText({ path: "src/foo.ts", symbol: "MyClass.myMethod" });
    expect(result).toEqual({ path: "src/foo.ts", suffix: "→ symbol MyClass.myMethod" });
  });

  it("returns map suffix when map is true", () => {
    const result = formatReadCallText({ path: "src/foo.ts", map: true });
    expect(result).toEqual({ path: "src/foo.ts", suffix: "+ map" });
  });

  it("returns null path when path is missing", () => {
    const result = formatReadCallText({});
    expect(result).toEqual({ path: null, suffix: undefined });
  });

  it("ignores map when false", () => {
    const result = formatReadCallText({ path: "src/foo.ts", map: false });
    expect(result).toEqual({ path: "src/foo.ts", suffix: undefined });
  });

  it("prefers symbol over map when both present (mutual exclusion in schema)", () => {
    const result = formatReadCallText({ path: "src/foo.ts", symbol: "foo", map: true });
    expect(result.suffix).toBe("→ symbol foo");
  });

  it("includes offset/limit in suffix when present", () => {
    const result = formatReadCallText({ path: "src/foo.ts", offset: 10, limit: 20 });
    expect(result).toEqual({ path: "src/foo.ts", suffix: "lines 10-29" });
  });
});

describe("formatReadResultText", () => {
  it("returns line count and range for a normal read", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 50, totalLines: 200 },
      truncation: null,
      symbol: null,
      map: { requested: false, appended: false },
      warnings: [],
    });
    expect(result.summary).toBe("✓ 50 lines (1-50 of 200)");
    expect(result.badges).toEqual([]);
    expect(result.errorText).toBeUndefined();
  });

  it("returns simple line count when range covers full file", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 50, totalLines: 50 },
      truncation: null,
      symbol: null,
      map: { requested: false, appended: false },
      warnings: [],
    });
    expect(result.summary).toBe("✓ 50 lines");
  });

  it("includes symbol info when symbol is present", () => {
    const result = formatReadResultText({
      range: { startLine: 10, endLine: 30, totalLines: 200 },
      truncation: null,
      symbol: { query: "foo", name: "registerReadTool", kind: "function", startLine: 10, endLine: 30 },
      map: { requested: false, appended: false },
      warnings: [],
    });
    expect(result.symbolBadge).toBe("function registerReadTool");
  });

  it("includes map badge when map is appended", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 50, totalLines: 200 },
      truncation: null,
      symbol: null,
      map: { requested: true, appended: true },
      warnings: [],
    });
    expect(result.badges).toContain("📐 map");
  });

  it("includes binary warning badge", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 50, totalLines: 50 },
      truncation: null,
      symbol: null,
      map: { requested: false, appended: false },
      warnings: [{ code: "binary-content", message: "[Warning: file appears to be binary]" }],
    });
    expect(result.badges).toContain("⚠ binary");
  });

  it("includes bare-cr warning badge", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 50, totalLines: 50 },
      truncation: null,
      symbol: null,
      map: { requested: false, appended: false },
      warnings: [{ code: "bare-cr", message: "[Warning: bare CR]" }],
    });
    expect(result.badges).toContain("⚠ bare CR");
  });

  it("shows truncation in summary", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 2000, totalLines: 5000 },
      truncation: { outputLines: 2000, totalLines: 5000, outputBytes: 50000, totalBytes: 120000 },
      symbol: null,
      map: { requested: false, appended: false },
      warnings: [],
    });
    expect(result.summary).toContain("2000");
    expect(result.summary).toContain("5000");
    expect(result.truncated).toBe(true);
  });

  it("returns error text for error results", () => {
    const result = formatReadResultText({
      range: { startLine: 1, endLine: 0, totalLines: 0 },
      truncation: null,
      symbol: null,
      map: { requested: false, appended: false },
      warnings: [],
      isError: true,
      errorText: "File not found: src/missing.ts",
    });
    expect(result.errorText).toBe("File not found: src/missing.ts");
  });
});

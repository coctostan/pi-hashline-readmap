import { describe, it, expect } from "vitest";
import { aggregateTestOutput, isTestCommand } from "../src/rtk/test-output.js";

describe("isTestCommand", () => {
  it("matches known test runners", () => {
    expect(isTestCommand("vitest")).toBe(true);
    expect(isTestCommand("npx vitest run")).toBe(true);
    expect(isTestCommand("npm test")).toBe(true);
    expect(isTestCommand("jest --watch")).toBe(true);
    expect(isTestCommand("pytest")).toBe(true);
    expect(isTestCommand("cargo test")).toBe(true);
    expect(isTestCommand("bun test")).toBe(true);
    expect(isTestCommand("go test ./...")).toBe(true);
    expect(isTestCommand("mocha")).toBe(true);
  });

  it("rejects non-test commands", () => {
    expect(isTestCommand("echo hello")).toBe(false);
    expect(isTestCommand("git diff")).toBe(false);
    expect(isTestCommand("tsc")).toBe(false);
    expect(isTestCommand("")).toBe(false);
    expect(isTestCommand(null)).toBe(false);
    expect(isTestCommand(undefined)).toBe(false);
  });

  it("does not match words in flag arguments (jj describe -m '...tests...')", () => {
    expect(isTestCommand("jj describe -m \"fix: failing tests\"")).toBe(false);
    expect(isTestCommand("git commit -m \"add tests\"")).toBe(false);
    expect(isTestCommand("echo 'run tests'")).toBe(false);
  });
});

describe("aggregateTestOutput — pass case", () => {
  it("returns null (no compression) when command pipes to cat", () => {
    const output = "✓ test one\n✓ test two\nTests  2 passed (2)";
    expect(aggregateTestOutput(output, "npm test 2>&1 | cat")).toBeNull();
    expect(aggregateTestOutput(output, "vitest | cat")).toBeNull();
  });
  it("returns null for non-test commands", () => {
    expect(aggregateTestOutput("some output", "echo hello")).toBeNull();
    expect(aggregateTestOutput("some output", null)).toBeNull();
  });

  it("compresses all-passing output to a brief summary", () => {
    const output = [
      "✓ test one",
      "✓ test two",
      "✓ test three",
      "Tests  3 passed (3)",
    ].join("\n");

    const result = aggregateTestOutput(output, "vitest");
    expect(result).toContain("📋 Test Results:");
    expect(result).toContain("✅ 3 passed");
    // Should NOT include individual test names
    expect(result).not.toContain("test one");
  });

  it("includes skipped count when nonzero", () => {
    const output = "Tests  5 passed, 2 skipped (7)";
    const result = aggregateTestOutput(output, "vitest");
    expect(result).toContain("5 passed");
    expect(result).toContain("2 skipped");
  });
});

describe("aggregateTestOutput — fail case (full output preserved)", () => {
  const failOutput = [
    "✓ passing test",
    "",
    "FAIL src/foo.test.ts",
    "",
    "● foo › should return 42",
    "",
    "  AssertionError: expected 0 to equal 42",
    "",
    "  Expected: 42",
    "  Received: 0",
    "",
    "    at Object.<anonymous> (src/foo.test.ts:10:5)",
    "    at runTest (node_modules/vitest/dist/index.js:123:3)",
    "",
    "Tests  1 failed, 1 passed (2)",
  ].join("\n");

  it("returns the raw output when tests fail", () => {
    const result = aggregateTestOutput(failOutput, "npm test");
    expect(result).not.toBeNull();
    // Full error detail preserved
    expect(result).toContain("AssertionError: expected 0 to equal 42");
    expect(result).toContain("Expected: 42");
    expect(result).toContain("Received: 0");
    expect(result).toContain("src/foo.test.ts:10:5");
  });

  it("does not compress to a summary when there are failures", () => {
    const result = aggregateTestOutput(failOutput, "vitest");
    expect(result).not.toContain("📋 Test Results:");
  });

  it("preserves output under the 8000-char cap verbatim", () => {
    const result = aggregateTestOutput(failOutput, "vitest");
    expect(result).toBe(failOutput);
  });

  it("truncates very long failing output from the tail (errors are at the end)", () => {
    // Build a large output: many passing lines + failure at the end
    const passingLines = Array.from({ length: 1000 }, (_, i) => `✓ test ${i} — some descriptive name here`).join("\n");
    const failureBlock = [
      "",
      "FAIL src/bar.test.ts",
      "● bar › must work",
      "  AssertionError: expected false to be true",
      "  at bar.test.ts:5:3",
      "",
      "Tests  1 failed (501)",
    ].join("\n");
    const bigOutput = passingLines + failureBlock;

    // Verify it's over the cap
    expect(bigOutput.length).toBeGreaterThan(8000);

    const result = aggregateTestOutput(bigOutput, "vitest");
    expect(result).not.toBeNull();
    expect(result).toContain("... (output truncated");
    // The failure details at the tail must be preserved
    expect(result).toContain("AssertionError: expected false to be true");
    expect(result).toContain("bar.test.ts:5:3");
  });
});

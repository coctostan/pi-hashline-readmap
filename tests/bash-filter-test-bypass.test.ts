import { describe, it, expect, vi } from "vitest";
import { filterBashOutput, isTestCommand } from "../src/rtk/bash-filter.js";
import * as testOutput from "../src/rtk/test-output.js";
import * as gitModule from "../src/rtk/git.js";

const ANSI_INPUT = "\x1b[32m✓ test passed\x1b[0m\n\x1b[31m✗ test failed\x1b[0m\nsome stack trace";
const STRIPPED = "✓ test passed\n✗ test failed\nsome stack trace";

describe("isTestCommand — extended coverage", () => {
  it("matches bun test", () => expect(isTestCommand("bun test")).toBe(true));
  it("matches go test", () => expect(isTestCommand("go test ./...")).toBe(true));
  it("matches mocha", () => expect(isTestCommand("mocha --reporter spec")).toBe(true));
  it("matches npx vitest run", () => expect(isTestCommand("npx vitest run")).toBe(true));
});

describe("test command bypass", () => {
  it("returns ANSI-stripped but uncompressed output for vitest", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("vitest run", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    expect(result.output).toContain("some stack trace");
    expect(result.output).toContain("✓ test passed");
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for npm test", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("npm test", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for jest", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("jest --coverage", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for pytest", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("pytest -v", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for cargo test", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("cargo test", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for bun test", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("bun test", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for go test", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("go test ./...", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("returns ANSI-stripped but uncompressed for mocha", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("mocha --reporter spec", ANSI_INPUT);
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe(STRIPPED);
    spy.mockRestore();
  });

  it("savedChars reflects ANSI stripping only", () => {
    const result = filterBashOutput("vitest run", ANSI_INPUT);
    expect(result.savedChars).toBe(ANSI_INPUT.length - STRIPPED.length);
  });

  it("still compresses git commands (non-test commands unaffected)", () => {
    const gitSpy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed git");
    const result = filterBashOutput("git diff", "some git output");
    expect(gitSpy).toHaveBeenCalledWith("some git output", "git diff");
    expect(result.output).toBe("compressed git");
    gitSpy.mockRestore();
  });
});

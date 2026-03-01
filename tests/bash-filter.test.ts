import { describe, it, expect, vi } from "vitest";
import {
  filterBashOutput,
  isTestCommand,
  isGitCommand,
  isBuildCommand,
  isLinterCommand,
} from "../src/rtk/bash-filter.js";
import * as testOutput from "../src/rtk/test-output.js";

describe("command detection", () => {
  it("matches all AC6–AC9 examples", () => {
    // AC6
    expect(isTestCommand("vitest")).toBe(true);
    expect(isTestCommand("jest")).toBe(true);
    expect(isTestCommand("pytest")).toBe(true);
    expect(isTestCommand("cargo test")).toBe(true);
    expect(isTestCommand("npm test")).toBe(true);
    expect(isTestCommand("npx vitest")).toBe(true);

    // AC7
    expect(isGitCommand("git")).toBe(true);
    expect(isGitCommand("git diff")).toBe(true);
    expect(isGitCommand("git status")).toBe(true);

    // AC8
    expect(isBuildCommand("tsc")).toBe(true);
    expect(isBuildCommand("cargo build")).toBe(true);
    expect(isBuildCommand("npm run build")).toBe(true);

    // AC9
    expect(isLinterCommand("eslint .")).toBe(true);
    expect(isLinterCommand("prettier --check .")).toBe(true);
    expect(isLinterCommand("tsc --noEmit")).toBe(true);

    // negatives
    expect(isTestCommand("echo hello")).toBe(false);
    expect(isGitCommand("echo git")).toBe(false);
    expect(isBuildCommand("echo build")).toBe(false);
    expect(isLinterCommand("echo lint")).toBe(false);
  });
});

describe("filterBashOutput routing", () => {
  it("routes test commands to aggregateTestOutput and falls back when null", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue("compressed test output");

    const result = filterBashOutput("npm test", "raw test output");
    expect(spy).toHaveBeenCalledWith("raw test output", "npm test");
    expect(result.output).toBe("compressed test output");

    spy.mockReturnValue(null);
    const nullResult = filterBashOutput("npm test", "\x1b[32mraw test\x1b[0m");
    expect(nullResult.output).toBe("raw test");
    // AC2: technique receives ANSI-stripped input, not raw ANSI
    expect(spy).toHaveBeenLastCalledWith("raw test", "npm test");

    spy.mockRestore();
  });
});

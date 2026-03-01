import { describe, it, expect, vi } from "vitest";
import {
  filterBashOutput,
  isTestCommand,
  isGitCommand,
  isBuildCommand,
  isLinterCommand,
} from "../src/rtk/bash-filter.js";
import * as testOutput from "../src/rtk/test-output.js";
import * as gitModule from "../src/rtk/git.js";

describe("command detection", () => {
  it("matches all AC6–AC9 examples", () => {
    expect(isTestCommand("vitest")).toBe(true);
    expect(isTestCommand("jest")).toBe(true);
    expect(isTestCommand("pytest")).toBe(true);
    expect(isTestCommand("cargo test")).toBe(true);
    expect(isTestCommand("npm test")).toBe(true);
    expect(isTestCommand("npx vitest")).toBe(true);

    expect(isGitCommand("git diff")).toBe(true);

    expect(isBuildCommand("tsc")).toBe(true);
    expect(isBuildCommand("cargo build")).toBe(true);
    expect(isBuildCommand("npm run build")).toBe(true);

    expect(isLinterCommand("eslint .")).toBe(true);
    expect(isLinterCommand("prettier --check .")).toBe(true);
    expect(isLinterCommand("tsc --noEmit")).toBe(true);

    expect(isTestCommand("echo hello")).toBe(false);
  });
});

describe("filterBashOutput routing", () => {
  it("routes test commands to aggregateTestOutput", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockReturnValue("compressed test output");
    const result = filterBashOutput("npm test", "raw test output");
    expect(spy).toHaveBeenCalledWith("raw test output", "npm test");
    expect(result.output).toBe("compressed test output");
    // AC2: technique receives ANSI-stripped input
    filterBashOutput("npm test", "\x1b[32mraw test\x1b[0m");
    expect(spy).toHaveBeenLastCalledWith("raw test", "npm test");
    spy.mockRestore();
  });

  it("routes git commands to compactGitOutput and falls back when null", () => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed git output");

    const result = filterBashOutput("git diff", "raw git output");
    expect(spy).toHaveBeenCalledWith("raw git output", "git diff");
    expect(result.output).toBe("compressed git output");

    spy.mockReturnValue(null);
    const nullResult = filterBashOutput("git commit -m 'fix'", "commit output");
    expect(nullResult.output).toBe("commit output");

    spy.mockRestore();
  });
});

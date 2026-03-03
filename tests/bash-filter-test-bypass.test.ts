import { describe, expect, it, vi } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";
import * as git from "../src/rtk/git.js";

const ansiOutput = [
  "\u001b[31mFAIL\u001b[0m src/example.test.ts > does thing",
  "AssertionError: expected 1 to equal 2",
  "    at src/example.test.ts:10:15",
  "    at processTicksAndRejections (node:internal/process/task_queues:95:5)",
].join("\n");

const strippedOutput = [
  "FAIL src/example.test.ts > does thing",
  "AssertionError: expected 1 to equal 2",
  "    at src/example.test.ts:10:15",
  "    at processTicksAndRejections (node:internal/process/task_queues:95:5)",
].join("\n");

describe("bash filter test-command bypass", () => {
  it.each(["vitest run", "npm test", "jest --coverage", "pytest -v"])(
    "returns ANSI-stripped uncompressed output for %s",
    (command) => {
      const gitSpy = vi.spyOn(git, "compactGitOutput");

      const result = filterBashOutput(command, ansiOutput);

      expect(result.output).toBe(strippedOutput);
      expect(result.output).toContain("AssertionError: expected 1 to equal 2");
      expect(result.output).toContain("at src/example.test.ts:10:15");
      expect(gitSpy).not.toHaveBeenCalled();

      gitSpy.mockRestore();
    },
  );

  it("still compresses non-test commands", () => {
    const gitSpy = vi.spyOn(git, "compactGitOutput").mockReturnValue("compressed git output");

    const result = filterBashOutput("git diff", ansiOutput);

    expect(gitSpy).toHaveBeenCalled();
    expect(result.output).toBe("compressed git output");

    gitSpy.mockRestore();
  });
});

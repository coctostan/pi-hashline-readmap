import { describe, it, expect, vi, afterEach } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";
import * as gitModule from "../src/rtk/git.js";

afterEach(() => vi.restoreAllMocks());

const lines = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);

const gitLog = [1, 2, 3]
  .flatMap((n) => [
    `commit ${String(n).repeat(40)}`,
    "Author: Dev <dev@example.com>",
    "Date:   Mon Nov 2 12:00:00 2026 -0500",
    "",
    `    feat: change ${n}`,
    "",
    ...lines(`    body line of commit ${n}`, 12),
    "",
  ])
  .join("\n");

describe("a command line with several printing parts passes through", () => {
  it.each([
    ["git log -3; gh pr view 259 --json body", `${gitLog}\n${JSON.stringify({ body: lines("PR body line", 20).join("\n") })}`],
    ["git log -1 --format=%B && cat README.md", ["feat: change 1", "", ...lines("body", 10), "", "# README", ...lines("readme line", 25)].join("\n")],
  ])("%s keeps every line", (command, output) => {
    const result = filterBashOutput(command, output);
    expect(result.info.technique).toBe("none");
    // A bash anti-pattern hint (here, for `cat`) may follow the output; the output itself is whole.
    expect(result.output.slice(0, output.length)).toBe(output);
  });

  it("git status && git diff passes through without calling the git compactor", () => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed");
    const result = filterBashOutput("git status && git diff", "raw output");
    expect(spy).not.toHaveBeenCalled();
    expect(result.info.technique).toBe("none");
    expect(result.output).toBe("raw output");
  });
});

describe("the one printing part picks the route", () => {
  it.each([
    ["cd sub && git diff", "git diff"],
    ["export X=1; git diff", "git diff"],
    ["pushd sub && git diff", "git diff"],
    ["git diff; popd", "git diff"],
    ["unset X; set -e; git diff", "git diff"],
    ["mkdir -p out && git diff", "git diff"],
    ["true; : ; X=1; git diff 2>&1", "git diff 2>&1"],
    ["echo msg | git commit -F -", "git commit -F -"],
    ["git diff $(git merge-base main HEAD)", "git diff $(git merge-base main HEAD)"],
  ])("%s routes git with the compactor seeing %s", (command, part) => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed");
    const result = filterBashOutput(command, "raw output");
    expect(spy).toHaveBeenCalledWith("raw output", part, []);
    expect(result.info.technique).toBe("git");
    expect(result.output).toBe("compressed");
  });

  it.each([
    "git diff | cat",
    "echo $(git log)",
    "for f in a b; do git diff $f; done",
    "cd - && git diff",
    "mkdir -p -v out && git diff",
    "mkdir -p --verbose out && git diff",
    "set -ev; git diff",
    "cd sub",
  ])("%s has no git route", (command) => {
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockReturnValue("compressed");
    const result = filterBashOutput(command, "raw output");
    expect(spy).not.toHaveBeenCalled();
    expect(result.info.technique).toBe("none");
    expect(result.output).toMatch(/^raw output(\n\n\[Hint: [^]*)?$/);
  });

  it("a test run piped into tail routes as tail", () => {
    expect(filterBashOutput("npm test 2>&1 | tail -5", "\u001b[32mok\u001b[0m").info.technique).toBe("none");
    expect(filterBashOutput("cd pkg && npm test", "ok").info.technique).toBe("test-output");
  });
});

import { describe, it, expect } from "vitest";
import {
  isGitCommand,
  compactDiff,
  compactStatus,
  compactLog,
  compactGitOutput,
} from "../src/rtk/git.js";

describe("isGitCommand", () => {
  it("matches git diff", () => {
    expect(isGitCommand("git diff")).toBe(true);
  });

  it("matches git status", () => {
    expect(isGitCommand("git status")).toBe(true);
  });

  it("matches git log", () => {
    expect(isGitCommand("git log --oneline")).toBe(true);
  });

  it("matches git show", () => {
    expect(isGitCommand("git show HEAD")).toBe(true);
  });

  it("matches git stash", () => {
    expect(isGitCommand("git stash list")).toBe(true);
  });

  it("rejects npm install", () => {
    expect(isGitCommand("npm install")).toBe(false);
  });

  it("rejects cargo test", () => {
    expect(isGitCommand("cargo test")).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isGitCommand(undefined)).toBe(false);
  });

  it("rejects null", () => {
    expect(isGitCommand(null)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isGitCommand("")).toBe(false);
  });
});

describe("compactDiff", () => {
  it("preserves diff content with file headers", () => {
    const output = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "--- a/src/foo.ts",
      "+++ b/src/foo.ts",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line",
      "+new line",
      " line3",
    ].join("\n");

    const result = compactDiff(output);
    expect(result).toContain("src/foo.ts");
    expect(result).toContain("+new line");
    expect(result).toContain("-old line");
  });

  it("truncates large diffs significantly", () => {
    const lines: string[] = ["diff --git a/big.ts b/big.ts", "--- a/big.ts", "+++ b/big.ts", "@@ -1,200 +1,200 @@"];
    for (let i = 0; i < 200; i++) {
      lines.push(`+added line ${i}`);
    }
    const output = lines.join("\n");

    const result = compactDiff(output, 20);
    const resultLines = result.split("\n");
    // Should be dramatically smaller than the 200+ input lines
    expect(resultLines.length).toBeLessThan(30);
    expect(result).toContain("more changes");
  });

  it("returns output unchanged when under maxLines", () => {
    const output = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = compactDiff(output, 100);
    expect(result).toContain("+new");
    expect(result).toContain("-old");
  });
});

describe("compactStatus", () => {
  it("returns clean for empty output", () => {
    expect(compactStatus("")).toBe("Clean working tree");
  });

  it("shows branch name and staged files", () => {
    const output = [
      "## main...origin/main",
      "M  src/foo.ts",
      "A  src/bar.ts",
    ].join("\n");

    const result = compactStatus(output);
    expect(result).toContain("main");
    expect(result).toContain("Staged");
    expect(result).toContain("2 files");
  });

  it("shows modified files", () => {
    const output = [
      "## feature",
      " M src/changed.ts",
    ].join("\n");

    const result = compactStatus(output);
    expect(result).toContain("Modified");
    expect(result).toContain("src/changed.ts");
  });

  it("shows untracked files", () => {
    const output = [
      "## main",
      "?? newfile.ts",
    ].join("\n");

    const result = compactStatus(output);
    expect(result).toContain("Untracked");
    expect(result).toContain("newfile.ts");
  });

  it("preserves unsupported long-form status output across working-tree states", () => {
    const outputs = [
      [
        "On branch main",
        "Changes not staged for commit:",
        "  (use \"git add <file>...\" to update what will be committed)",
        "  (use \"git restore <file>...\" to discard changes in working directory)",
        "",
        "\tmodified:   src/changed.ts",
        "",
        "no changes added to commit (use \"git add\" and/or \"git commit -a\")",
      ].join("\n"),
      [
        "On branch main",
        "nothing to commit, working tree clean",
      ].join("\n"),
      [
        "On branch main",
        "Changes to be committed:",
        "  (use \"git restore --staged <file>...\" to unstage)",
        "",
        "\tnew file:   src/staged.ts",
      ].join("\n"),
      [
        "On branch main",
        "Untracked files:",
        "  (use \"git add <file>...\" to include in what will be committed)",
        "",
        "\tsrc/untracked.ts",
      ].join("\n"),
      [
        "On branch main",
        "You have unmerged paths.",
        "  (fix conflicts and run \"git commit\")",
        "",
        "Unmerged paths:",
        "  (use \"git add <file>...\" to mark resolution)",
        "",
        "\tboth modified:   src/conflicted.ts",
      ].join("\n"),
      [
        "## main",
        " M src/changed.ts",
        "post-processing output",
      ].join("\n"),
    ];

    for (const output of outputs) {
      expect(compactStatus(output)).toBe(output);
    }
  });
});

describe("compactLog", () => {
  it("limits log entries to default 20", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`abc${i}def commit message ${i}`);
    }
    const output = lines.join("\n");

    const result = compactLog(output);
    expect(result).toContain("and 30 more commits");
  });

  it("limits log entries to custom limit", () => {
    const lines: string[] = [];
    for (let i = 0; i < 20; i++) {
      lines.push(`commit ${i}`);
    }
    const output = lines.join("\n");

    const result = compactLog(output, 5);
    expect(result).toContain("and 15 more commits");
  });

  it("returns all entries when under limit", () => {
    const output = "commit 1\ncommit 2\ncommit 3";
    const result = compactLog(output, 10);
    expect(result).not.toContain("more commits");
    expect(result).toContain("commit 1");
    expect(result).toContain("commit 3");
  });

  it("truncates long lines to 80 chars", () => {
    const longLine = "a".repeat(100);
    const result = compactLog(longLine);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toContain("...");
  });
});

describe("compactGitOutput", () => {
  it("dispatches git diff to compactDiff", () => {
    const output = [
      "diff --git a/f.ts b/f.ts",
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = compactGitOutput(output, "git diff");
    expect(result).not.toBeNull();
    expect(result).toContain("f.ts");
  });

  it("dispatches git status to compactStatus", () => {
    const result = compactGitOutput("## main\n?? new.ts", "git status --short");
    expect(result).not.toBeNull();
    expect(result).toContain("main");
  });

  it("dispatches git log to compactLog", () => {
    const result = compactGitOutput("commit 1\ncommit 2", "git log --oneline");
    expect(result).not.toBeNull();
    expect(result).toContain("commit 1");
  });

  it("returns null for non-git commands", () => {
    expect(compactGitOutput("output", "npm test")).toBeNull();
  });

  it("returns null for unrecognized git subcommands", () => {
    expect(compactGitOutput("output", "git push origin main")).toBeNull();
  });
});

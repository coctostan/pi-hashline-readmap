import { describe, it, expect } from "vitest";
import {
  isGitCommand,
  compactDiff,
  compactStatus,
  compactLog,
  compactGitOutput,
} from "../src/rtk/git.js";
import { gitLog, gitLogGraph, gitLogOneline, sha } from "./helpers/git-log-fixture.js";
import type { Drop } from "../src/rtk/drops.js";

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
    expect(result).toMatch(/^\.\.\. and \d+ more lines$/m);
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

  it("keeps a file's rename, mode and binary lines, dropping only index and the ---/+++ headers", () => {
    const output = [
      ...["diff --git a/old.ts b/new.ts", "similarity index 100%", "rename from old.ts", "rename to new.ts"],
      ...["diff --git a/logo.png b/logo.png", "index 1111111..2222222 100644", "Binary files a/logo.png and b/logo.png differ"],
    ].join("\n");
    expect(compactDiff(output)).toBe(
      ["", "📄 new.ts", "  similarity index 100%", "  rename from old.ts", "  rename to new.ts", "", "📄 logo.png", "  Binary files a/logo.png and b/logo.png differ"].join("\n"),
    );
  });

  it("keeps a file header it can't read, such as git's quoted non-ASCII path", () => {
    const header = 'diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"';
    expect(compactDiff([header, "@@ -1 +1 @@", "-a", "+b"].join("\n"))).toContain(`📄 ${header}`);
  });
  it("passes output with no file diff through, such as --stat", () => {
    const stat = " src/a.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n";
    expect(compactDiff(stat)).toBe(stat);
    expect(compactGitOutput(stat, "git diff --stat")).toBeNull();
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
    expect(result).toBe("📌 feature\n📝 Modified: 1 files\n  src/changed.ts");
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

  it("keeps the branch line's tracking and lists a conflict under Conflicts, not Staged", () => {
    const output = ["## main...origin/main [ahead 1]", "DU a.ts", "M  b.ts", ""].join("\n");
    expect(compactStatus(output)).toBe(
      ["📌 main...origin/main [ahead 1]", "✅ Staged: 1 files", "  b.ts", "⚠️ Conflicts: 1 files", "  DU a.ts"].join("\n"),
    );
  });

  // The unmerged pairs of git-status(1)'s short-format table.
  it.each(["DD", "AU", "UD", "UA", "DU", "AA", "UU"])("lists %s only under Conflicts", (code) => {
    expect(compactStatus(`## main\n${code} a.ts`)).toBe(`📌 main\n⚠️ Conflicts: 1 files\n  ${code} a.ts`);
  });

  it("never cuts the conflicts", () => {
    const conflicts = Array.from({ length: 7 }, (_, i) => `UU c${i}.ts`);
    const drops: Drop[] = [];
    const result = compactStatus(["## main", ...conflicts].join("\n"), drops);
    expect(result).toBe(["📌 main", "⚠️ Conflicts: 7 files", ...conflicts.map((line) => `  ${line}`)].join("\n"));
    expect(drops).toEqual([]);
  });

  it("lists type changes and intent-to-add as changes, and ignored files under Ignored, cut at 3", () => {
    const ignored = Array.from({ length: 5 }, (_, i) => `!! build/${i}.o`);
    const drops: Drop[] = [];
    const result = compactStatus(["## main", "T  link", " T tool", " A intent.ts", ...ignored].join("\n"), drops);
    expect(result).toBe(
      [
        ...["📌 main", "✅ Staged: 1 files", "  link", "📝 Modified: 2 files", "  tool", "  intent.ts"],
        ...["🚫 Ignored: 5 files", "  build/0.o", "  build/1.o", "  build/2.o", "  ... and 2 more files"],
      ].join("\n"),
    );
    expect(drops).toEqual([{ count: 2, unit: "files" }]);
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
  it("returns a log within 20 commits unchanged", () => {
    for (const log of [gitLog(3), gitLog(20)]) expect(compactLog(log)).toBe(log);
  });

  it("keeps 20 whole commits, bodies uncut, and counts the dropped commits", () => {
    const log = gitLog(30);
    const kept = log.slice(0, log.indexOf(`commit ${sha(20)}`));
    expect(compactLog(log)).toBe(`${kept}... and 10 more commits`);
  });

  it("splits --graph output at its prefixed commit headers", () => {
    const log = gitLogGraph(30);
    const kept = log.slice(0, log.indexOf(`* commit ${sha(20)}`));
    expect(compactLog(log)).toBe(`${kept}... and 10 more commits`);
  });

  it("counts a merge and a side-branch commit in --graph output as headers", () => {
    const log = [
      `*   commit ${sha(1)}`,
      "|\\  Merge: aaaaaaa bbbbbbb",
      `| * commit ${sha(2)}`,
      "|/  Author: A <a@example.test>",
      `* commit ${sha(3)}`,
      "  Author: A <a@example.test>",
    ].join("\n");
    expect(compactLog(log, 2)).toBe(`${log.split("\n").slice(0, 4).join("\n")}\n... and 1 more commits`);
  });

  // Header shapes measured from git 2.x: side marks without --graph, node markers and a blank first column with it.
  it.each([
    ["--left-right", ["commit < SHA", "commit > SHA"]],
    ["--boundary", ["commit - SHA"]],
    ["--cherry-mark", ["commit + SHA", "commit = SHA"]],
    ["--graph --left-right", ["< commit SHA", "  > commit SHA"]],
    ["--graph --boundary", ["o commit SHA", "o | commit SHA"]],
    ["--graph with a blank first column", ["  * commit SHA", "|   * commit SHA"]],
    ["--graph octopus merge", ["*---.   commit SHA"]],
    ["--abbrev-commit --abbrev=4", ["commit 5bcd"]],
  ])("counts %s headers", (_, shapes) => {
    const headers = [`commit ${sha(0)}`, ...shapes.map((shape, i) => shape.replace("SHA", sha(i + 1)))];
    const log = headers.map((header) => `${header}\nAuthor: A <a@example.test>`).join("\n");
    expect(compactLog(log, 1)).toBe(`${headers[0]}\nAuthor: A <a@example.test>\n... and ${shapes.length} more commits`);
  });

  it("keeps 20 lines of headerless output and counts the dropped lines", () => {
    const log = gitLogOneline(30);
    const kept = log.split("\n").slice(0, 20).join("\n");
    expect(compactLog(log)).toBe(`${kept}\n... and 10 more lines`);
  });

  it("does not count a trailing newline as a dropped line", () => {
    const log = gitLogOneline(20);
    expect(compactLog(log)).toBe(log);
  });

  it("honors a custom limit", () => {
    expect(compactLog(gitLogOneline(20), 5)).toMatch(/\n\.\.\. and 15 more lines$/);
    expect(compactLog(gitLog(20), 5)).toMatch(/\n\.\.\. and 15 more commits$/);
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

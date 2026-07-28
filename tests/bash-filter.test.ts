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
import * as linterModule from "../src/rtk/linter.js";
import * as buildModule from "../src/rtk/build.js";
import * as buildToolsModule from "../src/rtk/build-tools.js";
import * as transferModule from "../src/rtk/transfer.js";

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

    expect(isBuildCommand("cargo clippy")).toBe(false);

    expect(isLinterCommand("eslint .")).toBe(true);
    expect(isLinterCommand("prettier --check .")).toBe(true);
    expect(isLinterCommand("tsc --noEmit")).toBe(true);

    expect(isTestCommand("echo hello")).toBe(false);
  });

  it("excludes .tscn / typescript via word boundary but keeps tsc (#211)", () => {
    expect(isBuildCommand("git diff scenes/player/player.tscn")).toBe(false);
    expect(isBuildCommand("cat typescript-notes.md")).toBe(false);
    expect(isBuildCommand("tsc")).toBe(true);
    expect(isBuildCommand("tsc --noEmit")).toBe(true);
    expect(isBuildCommand("npx tsc")).toBe(true);
    expect(isBuildCommand("./node_modules/.bin/tsc")).toBe(true);
  });

  it("#219 reconcile: .tscn false-positive stays fixed for the reporter's exact command (GH PR #148)", () => {
    // Reporter scenario from GH PR #148 / issue #211: a Godot scene diff must not
    // be swallowed by the build-output filter, while real tsc invocations still are.
    expect(isBuildCommand("git diff scenes/player/player.tscn")).toBe(false);
    expect(isBuildCommand("cat ui/main_menu.tscn")).toBe(false);
    expect(isBuildCommand("tsc")).toBe(true);
    expect(isBuildCommand("npx tsc --noEmit")).toBe(true);
  });
});


describe("filterBashOutput core behavior", () => {
  it("returns empty output and zero savings for empty output", () => {
    expect(filterBashOutput("echo hello", "")).toEqual({
      output: "",
      savedChars: 0,
      info: {
        originalBytes: 0,
        outputBytes: 0,
        compressionRatio: 1,
        technique: "none",
      },
    });
  });

  it("returns ANSI-stripped output unchanged for unknown commands", () => {
    const input = "\x1b[32mhello\x1b[0m";
    const result = filterBashOutput("echo hello", input);
    expect(result.output).toBe("hello");
    expect(result.savedChars).toBe(input.length - "hello".length);
  });
});

describe("filterBashOutput routing", () => {
  it("test commands bypass compression — returns ANSI-stripped only", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput");
    const result = filterBashOutput("npm test", "\x1b[32mraw test\x1b[0m");
    expect(spy).not.toHaveBeenCalled();
    expect(result.output).toBe("raw test");
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

  it("falls back to ANSI-stripped output for unsupported long-form git status", () => {
    const raw = [
      "\x1b[36mOn branch main\x1b[0m",
      "Changes not staged for commit:",
      "  (use \"git add <file>...\" to update what will be committed)",
      "  (use \"git restore <file>...\" to discard changes in working directory)",
      "",
      "\tmodified:   src/changed.ts",
      "",
      "no changes added to commit (use \"git add\" and/or \"git commit -a\")",
    ].join("\n");
    const stripped = [
      "On branch main",
      "Changes not staged for commit:",
      "  (use \"git add <file>...\" to update what will be committed)",
      "  (use \"git restore <file>...\" to discard changes in working directory)",
      "",
      "\tmodified:   src/changed.ts",
      "",
      "no changes added to commit (use \"git add\" and/or \"git commit -a\")",
    ].join("\n");

    const result = filterBashOutput("git status", raw);

    expect(result.output).toBe(stripped);
    expect(result.info.technique).toBe("none");
  });

  it("routes linter commands to aggregateLinterOutput and falls back when null", () => {
    const spy = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue("compressed linter output");

    const result = filterBashOutput("eslint .", "raw linter output");
    expect(spy).toHaveBeenCalledWith("raw linter output", "eslint .");
    expect(result.output).toBe("compressed linter output");

    spy.mockReturnValue(null);
    const nullResult = filterBashOutput("eslint .", "raw linter output");
    expect(nullResult.output).toBe("raw linter output");

    spy.mockRestore();
  });

  it("falls through to build filtering when linter route matches but returns null", () => {
    const linterSpy = vi.spyOn(linterModule, "aggregateLinterOutput").mockReturnValue(null);
    const buildSpy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("build fallback output");

    const result = filterBashOutput("tsc --noEmit", "raw build output");

    expect(linterSpy).toHaveBeenCalledWith("raw build output", "tsc --noEmit");
    expect(buildSpy).toHaveBeenCalledWith("raw build output", "tsc --noEmit");
    expect(result.output).toBe("build fallback output");

    linterSpy.mockRestore();
    buildSpy.mockRestore();
  });

  it("routes build commands to filterBuildOutput and falls back when null", () => {
    const spy = vi.spyOn(buildModule, "filterBuildOutput").mockReturnValue("compressed build output");

    const result = filterBashOutput("tsc", "raw build output");
    expect(spy).toHaveBeenCalledWith("raw build output", "tsc");
    expect(result.output).toBe("compressed build output");

    spy.mockReturnValue(null);
    const nullResult = filterBashOutput("npm run build", "raw build output");
    expect(nullResult.output).toBe("raw build output");

    spy.mockRestore();
  });

  it("routes make commands to compressBuildToolsOutput", () => {
    const spy = vi.spyOn(buildToolsModule, "compressBuildToolsOutput").mockReturnValue("compressed make output");
    const result = filterBashOutput("make all", "raw make output");
    expect(spy).toHaveBeenCalledWith("raw make output");
    expect(result.output).toBe("compressed make output");
    spy.mockRestore();
  });

  it("routes cmake commands to compressBuildToolsOutput", () => {
    const spy = vi.spyOn(buildToolsModule, "compressBuildToolsOutput").mockReturnValue("compressed cmake output");
    const result = filterBashOutput("cmake --build .", "raw cmake output");
    expect(spy).toHaveBeenCalledWith("raw cmake output");
    expect(result.output).toBe("compressed cmake output");
    spy.mockRestore();
  });

  it("routes rsync commands to compressTransferOutput", () => {
    const spy = vi.spyOn(transferModule, "compressTransferOutput").mockReturnValue("compressed rsync output");
    const result = filterBashOutput("rsync -av src/ dst/", "raw rsync output");
    expect(spy).toHaveBeenCalledWith("raw rsync output");
    expect(result.output).toBe("compressed rsync output");
    spy.mockRestore();
  });

  it("routes scp commands to compressTransferOutput", () => {
    const spy = vi.spyOn(transferModule, "compressTransferOutput").mockReturnValue("compressed scp output");
    const result = filterBashOutput("scp file host:/path", "raw scp output");
    expect(spy).toHaveBeenCalledWith("raw scp output");
    expect(result.output).toBe("compressed scp output");
    spy.mockRestore();
  });
  it("keeps rsync completion status words while removing listing noise", () => {
    const input = [
      "src/file1.txt",
      "src/file2.txt",
      "src/file3.txt",
      "src/file4.txt",
      "src/file5.txt",
      "src/file6.txt",
      "src/file7.txt",
      "src/file8.txt",
      "src/file9.txt",
      "src/file10.txt",
      "src/file11.txt",
      "done",
      "transfer-complete",
      "sent 12000 bytes  received 34 bytes  100.00 bytes/sec",
    ].join("\n");

    const result = filterBashOutput("rsync -av src/ dst/", input);

    expect(result.output).toContain("done");
    expect(result.output).toContain("transfer-complete");
    expect(result.output).toContain("sent 12000 bytes");
    expect(result.output).not.toContain("src/file1.txt");
    expect(result.output).not.toContain("src/file11.txt");
  });


  it("test command bypass wins over build when both match (AC14: cargo test)", () => {
    const cmd = "cargo test";
    expect(isTestCommand(cmd)).toBe(true);
    expect(isBuildCommand(cmd)).toBe(true);

    const testSpy = vi.spyOn(testOutput, "aggregateTestOutput");
    const buildSpy = vi.spyOn(buildModule, "filterBuildOutput");

    const result = filterBashOutput(cmd, "\x1b[32msome output\x1b[0m");

    // Bypass fires: neither compressor is called
    expect(testSpy).not.toHaveBeenCalled();
    expect(buildSpy).not.toHaveBeenCalled();
    expect(result.output).toBe("some output");

    testSpy.mockRestore();
    buildSpy.mockRestore();
  });

  it("catches technique errors and returns ANSI-stripped original", () => {
    const spy = vi.spyOn(testOutput, "aggregateTestOutput").mockImplementation(() => {
      throw new Error("technique exploded");
    });

    const input = "\x1b[31mtest output\x1b[0m";
    const result = filterBashOutput("npm test", input);
    expect(result.output).toBe("test output");
    expect(result.savedChars).toBe(input.length - "test output".length);

    spy.mockRestore();
  });
});

describe("build.ts gate excludes .tscn (#211)", () => {
  it("isBuildCommand and filterBuildOutput ignore .tscn but keep tsc", () => {
    const realDiff = "diff --git a/scenes/player/player.tscn b/scenes/player/player.tscn\n@@ -1 +1 @@\n-old\n+new\n";
    expect(buildModule.isBuildCommand("git diff scenes/player/player.tscn")).toBe(false);
    expect(buildModule.filterBuildOutput(realDiff, "git diff scenes/player/player.tscn")).toBeNull();
    expect(buildModule.isBuildCommand("tsc")).toBe(true);
    expect(buildModule.isBuildCommand("tsc --noEmit")).toBe(true);
    expect(buildModule.isBuildCommand("npx tsc")).toBe(true);
  });
});
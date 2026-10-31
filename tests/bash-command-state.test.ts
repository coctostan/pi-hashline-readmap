import { describe, expect, it } from "vitest";
import { buildBashCommandState, extractShellFileMutationTargets } from "../src/bash-command-state.js";

describe("buildBashCommandState", () => {
  it("classifies git repo-state, history, and mutation commands", () => {
    expect(buildBashCommandState({ command: " git   status --short ", isError: false, text: " M src/a.ts" })).toMatchObject({
      normalizedCommand: "git status --short",
      commandKind: "vcs",
      stateKind: "repo-status",
      outcome: "success",
      semanticInvalidationSensitive: true,
      routineRetirementEligible: false,
      protectedFromRoutineRetirement: false,
    });

    expect(buildBashCommandState({ command: "git diff -- src/a.ts", isError: false, text: "diff --git a/src/a.ts b/src/a.ts" })).toMatchObject({
      normalizedCommand: "git diff -- src/a.ts",
      commandKind: "vcs",
      stateKind: "repo-diff",
      outcome: "success",
      semanticInvalidationSensitive: true,
      routineRetirementEligible: false,
    });

    expect(buildBashCommandState({ command: "git log --oneline -5", isError: false, text: "abc commit" })).toMatchObject({
      normalizedCommand: "git log --oneline -5",
      commandKind: "vcs",
      stateKind: "git-history",
      outcome: "success",
      semanticInvalidationSensitive: false,
      routineRetirementEligible: true,
    });

    expect(buildBashCommandState({ command: "git add src/a.ts", isError: false, text: "" })).toMatchObject({
      normalizedCommand: "git add src/a.ts",
      commandKind: "vcs",
      stateKind: "git-worktree-mutation",
      outcome: "success",
      protectedFromRoutineRetirement: true,
    });
  });

  it("classifies verification commands with exact normalized targets", () => {
    expect(buildBashCommandState({ command: "npm test", isError: true, text: "FAIL tests/a.test.ts" })).toMatchObject({
      normalizedCommand: "npm test",
      commandKind: "test",
      stateKind: "verification",
      outcome: "failure",
      protectedFromRoutineRetirement: true,
      routineRetirementEligible: false,
    });

    expect(buildBashCommandState({ command: "npm test -- tests/a.test.ts", isError: false, text: "PASS tests/a.test.ts" })).toMatchObject({
      normalizedCommand: "npm test -- tests/a.test.ts",
      commandKind: "test",
      stateKind: "verification",
      outcome: "success",
      protectedFromRoutineRetirement: false,
      routineRetirementEligible: true,
    });
  });

  it("protects diagnostics and unusual debugging output from routine retirement", () => {
    expect(buildBashCommandState({ command: "node debug-script.js", isError: false, text: "TypeError: boom\n    at main (debug-script.js:1:1)" })).toMatchObject({
      normalizedCommand: "node debug-script.js",
      commandKind: "other",
      stateKind: "debug",
      outcome: "success",
      containsDiagnostics: true,
      protectedFromRoutineRetirement: true,
      routineRetirementEligible: false,
    });
  });

  it("classifies append redirection as a shell file mutation", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "printf next >> logs/out.txt", cwd, text: "" });

    expect(state.stateKind).toBe("shell-file-mutation");
    expect(state.normalizedCommand).toBe("printf next >> logs/out.txt");
    expect(state.commandKind).toBe("other");
    expect(state.protectedFromRoutineRetirement).toBe(true);
    expect(state.routineRetirementEligible).toBe(false);
    expect(state.fileTargets).toEqual(["/tmp/hashline-bash-targets/logs/out.txt"]);
  });

  it("classifies tee output files as shell file mutation targets", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const teeState = buildBashCommandState({ command: "printf next | tee logs/out.txt", cwd, text: "next" });
    const appendTeeState = buildBashCommandState({ command: "printf next | tee -a logs/a.txt logs/b.txt", cwd, text: "next" });

    expect(teeState.stateKind).toBe("shell-file-mutation");
    expect(teeState.protectedFromRoutineRetirement).toBe(true);
    expect(teeState.routineRetirementEligible).toBe(false);
    expect(teeState.fileTargets).toEqual(["/tmp/hashline-bash-targets/logs/out.txt"]);

    expect(appendTeeState.stateKind).toBe("shell-file-mutation");
    expect(appendTeeState.protectedFromRoutineRetirement).toBe(true);
    expect(appendTeeState.routineRetirementEligible).toBe(false);
    expect(appendTeeState.fileTargets).toEqual(["/tmp/hashline-bash-targets/logs/a.txt", "/tmp/hashline-bash-targets/logs/b.txt"]);
  });

  it("classifies heredoc redirection as a shell file mutation", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "cat > generated.ts <<'EOF'\nexport const value = 1;\nEOF", cwd, text: "" });

    expect(state.stateKind).toBe("shell-file-mutation");
    expect(state.protectedFromRoutineRetirement).toBe(true);
    expect(state.routineRetirementEligible).toBe(false);
    expect(state.fileTargets).toEqual(["/tmp/hashline-bash-targets/generated.ts"]);
  });

  it("classifies sed in-place edits as shell file mutations", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const bsdState = buildBashCommandState({ command: "sed -i '' 's/old/new/' src/example.ts", cwd, text: "" });
    const gnuState = buildBashCommandState({ command: "sed -i 's/old/new/' src/other.ts", cwd, text: "" });

    expect(bsdState.stateKind).toBe("shell-file-mutation");
    expect(bsdState.protectedFromRoutineRetirement).toBe(true);
    expect(bsdState.routineRetirementEligible).toBe(false);
    expect(bsdState.fileTargets).toEqual(["/tmp/hashline-bash-targets/src/example.ts"]);

    expect(gnuState.stateKind).toBe("shell-file-mutation");
    expect(gnuState.protectedFromRoutineRetirement).toBe(true);
    expect(gnuState.routineRetirementEligible).toBe(false);
    expect(gnuState.fileTargets).toEqual(["/tmp/hashline-bash-targets/src/other.ts"]);
  });

  it("classifies mv source and destination as shell file mutation targets", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "mv src/old.ts src/new.ts", cwd, text: "" });

    expect(state.stateKind).toBe("shell-file-mutation");
    expect(state.protectedFromRoutineRetirement).toBe(true);
    expect(state.routineRetirementEligible).toBe(false);
    expect(state.fileTargets).toEqual(["/tmp/hashline-bash-targets/src/old.ts", "/tmp/hashline-bash-targets/src/new.ts"]);
  });

  it("classifies cp destination as a shell file mutation target", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "cp src/source.ts src/copy.ts", cwd, text: "" });

    expect(state.stateKind).toBe("shell-file-mutation");
    expect(state.protectedFromRoutineRetirement).toBe(true);
    expect(state.routineRetirementEligible).toBe(false);
    expect(state.fileTargets).toEqual(["/tmp/hashline-bash-targets/src/copy.ts"]);
  });

  it("classifies rm operands as shell file mutation targets", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "rm -f src/delete-a.ts src/delete-b.ts", cwd, text: "" });

    expect(state.stateKind).toBe("shell-file-mutation");
    expect(state.protectedFromRoutineRetirement).toBe(true);
    expect(state.routineRetirementEligible).toBe(false);
    expect(state.fileTargets).toEqual(["/tmp/hashline-bash-targets/src/delete-a.ts", "/tmp/hashline-bash-targets/src/delete-b.ts"]);
  });


  it("classifies install destination as a shell file mutation target", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "install -m 0644 build/out.d.ts src/out.d.ts", cwd, text: "" });

    expect(state.stateKind).toBe("shell-file-mutation");
    expect(state.protectedFromRoutineRetirement).toBe(true);
    expect(state.routineRetirementEligible).toBe(false);
    expect(state.fileTargets).toEqual(["/tmp/hashline-bash-targets/src/out.d.ts"]);
  });


  it("does not invent file targets inside eval commands", () => {
    const cwd = "/tmp/hashline-bash-targets";
    const state = buildBashCommandState({ command: "eval 'printf changed > src/generated.ts'", cwd, text: "" });

    expect(state.stateKind).toBe("debug");
    expect(state.fileTargets).toBeUndefined();
  });
});

describe("extractShellFileMutationTargets across a command chain", () => {
  const cwd = "/tmp/chain";
  const cases: Array<[string, string, string[]]> = [
    ["&& separator", "mkdir -p d && mv a b", ["a", "b"]],
    ["|| separator", "npm test || rm -f x", ["x"]],
    ["; separator", "echo hi; cp a b", ["b"]],
    ["background &", "sleep 1 & rm x", ["x"]],
    ["newline", "echo hi\ninstall -m 0644 a b", ["b"]],
    ["pipe into tee", "npm test 2>&1 | tee log.txt", ["log.txt"]],
    ["subshell and group", "(rm a) && { sed -i 's/x/y/' b; }", ["a", "b"]],
    ["NAME=value prefix", "FOO=1 BAR=2 sed -i 's/a/b/' f", ["f"]],
    ["if/then keywords", "if true; then sed -i 's/a/b/' f; fi", ["f"]],
    ["loop keywords", "for x in a b; do rm out.txt; done", ["out.txt"]],
    ["! and time", "! rm a && time cp b c", ["a", "c"]],
    ["heredoc body excluded", "cat <<'EOF'\nprintf a > x\nEOF\nsed -i 's/a/b/' y", ["y"]],
    ["<<- heredoc body excluded", "cat <<-EOF > out.txt\n\tprintf a > x\n\tEOF\nrm z", ["out.txt", "z"]],
    ["here-string is not a heredoc", "grep x <<< \"$v\"\nrm f", ["f"]],
    ["arithmetic shift is not a heredoc", "echo $((1 << 2))\nrm f", ["f"]],
    ["arithmetic command shift is not a heredoc", "((n <<= 1))\nrm f", ["f"]],
    ["arithmetic comparison is not a redirection", "echo $((a > b)) > out.txt; ((c > d))", ["out.txt"]],
    ["quoted > is not a redirection", "echo \"a > b\" && git commit -m 'x > y'", []],
    ["comment is not a redirection", "echo x > out.txt # > note.txt", ["out.txt"]],
    ["fd redirections", "cmd > a.txt 2> b.txt &> c.txt 2>&1 >/dev/null", ["a.txt", "b.txt", "c.txt"]],
    ["fd number is not an operand", "rm -f x 2>/dev/null", ["x"]],
    ["command substitution", "v=$(sed -i 's/a/b/' f)", ["f"]],
    ["substitutions in double quotes and backticks", "echo `rm a` \"$(rm b) `rm c`\"", ["a", "b", "c"]],
    ["subshell inside a substitution", "echo \"$( (rm a); rm b )\"", ["a", "b"]],
    ["comment inside a substitution", "echo \"$(printf x # (\n)\"; rm victim", ["victim"]],
    ["heredoc inside a substitution", "echo $(cat <<'EOF'\n) ; rm victim\nEOF\n)", []],
    ["process substitution", "diff <(sort a) <(sort b) > out.txt", ["out.txt"]],
    ["redirection of eval or source", "source env.sh > log.txt", ["log.txt"]],
  ];

  it.each(cases)("%s", (_name, command, expected) => {
    expect(extractShellFileMutationTargets(command, cwd)).toEqual(expected.map((target) => `${cwd}/${target}`));
  });
});

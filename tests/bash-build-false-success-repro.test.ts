import { describe, expect, it } from "vitest";
import { filterBashOutput, isBuildCommand } from "../src/rtk/bash-filter.js";
import * as buildModule from "../src/rtk/build.js";

describe("issue #222: build filtering must not fabricate success", () => {
  it("classifies executable build invocations without matching trigger text used as data", () => {
    const nonBuildCommands = [
      'echo "just the word tsc"',
      'echo "npm run build"',
      'grep -rF "tsc" .',
      "tsc --version",
      "typescript notes",
      "git diff scenes/player/player.tscn",
    ];

    for (const command of nonBuildCommands) {
      expect(isBuildCommand(command), command).toBe(false);
      expect(buildModule.isBuildCommand(command), command).toBe(false);
    }

    const preservedOutputCases = [
      ['echo "just the word tsc"', "just the word tsc\n"],
      ['echo "npm run build"', "npm run build\n"],
      ["tsc --version", "Version 5.9.3\n"],
      ["typescript notes", "typescript notes\n"],
    ] as const;

    for (const [command, rawOutput] of preservedOutputCases) {
      expect(filterBashOutput(command, rawOutput).output).toBe(rawOutput);
    }

    const builds = [
      "tsc",
      "tsc --noEmit",
      "npx tsc --noEmit",
      "./node_modules/.bin/tsc",
      "cargo build",
      "cargo check",
      "npm run build",
      "bun build",
      "yarn build",
      "yarn run build",
      "pnpm build",
      "pnpm run build",
      "go build ./...",
      "go install ./cmd/tool",
      "python setup.py build",
      "pip install .",
    ];

    for (const command of builds) {
      expect(isBuildCommand(command), command).toBe(true);
      expect(buildModule.isBuildCommand(command), command).toBe(true);
    }
  });


  it("falls back without positive build evidence and summarizes evidence-backed success", () => {
    const rawError = "\u001b[31merror TS5023: Unknown compiler option '--nonexistentflag'.\u001b[0m\n";
    const uncertain = filterBashOutput("./node_modules/.bin/tsc --nonexistentflag", rawError);

    expect(uncertain.output).toBe("error TS5023: Unknown compiler option '--nonexistentflag'.\n");
    expect(uncertain.info.technique).toBe("none");

    const successful = filterBashOutput(
      "cargo build",
      "Compiling demo v0.1.0\nFinished dev profile\n",
    );

    expect(successful.output).toBe("✓ Build successful (1 units compiled)");
    expect(successful.info.technique).toBe("build");
  });


  it("preserves failed output before any success-synthesizing RTK route runs", () => {
    const raw = "\u001b[31mCompiling demo v0.1.0\nlinker terminated unexpectedly\u001b[0m\n";
    const stripped = "Compiling demo v0.1.0\nlinker terminated unexpectedly\n";

    for (const command of ["cargo build", "eslint ."]) {
      const result = filterBashOutput(command, raw, { isError: true });

      expect(result.output, command).toBe(stripped);
      expect(result.info.technique, command).toBe("none");
      expect(result.savedChars, command).toBe(raw.length - stripped.length);
    }

    const failedTest = filterBashOutput("npm test", raw, { isError: true });
    expect(failedTest.output).toBe(stripped);
    expect(failedTest.info.technique).toBe("test-output");
  });
});
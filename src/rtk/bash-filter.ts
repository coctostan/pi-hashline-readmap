import { stripAnsi } from "./ansi.js";
import * as testOutput from "./test-output.js";
import * as git from "./git.js";
import * as linter from "./linter.js";
import * as build from "./build.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function isTestCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["vitest", "jest", "pytest", "cargo test", "npm test", "npx vitest", "bun test", "go test", "mocha"].some(
    (t) => c.includes(t),
  );
}

export function isGitCommand(command: string): boolean {
  const c = command.toLowerCase().trimStart();
  return c === "git" || c.startsWith("git ");
}

export function isBuildCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["tsc", "cargo build", "cargo check", "cargo test", "npm run build"].some((t) => c.includes(t));
}

export function isLinterCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["eslint", "prettier --check", "tsc --noemit"].some((t) => c.includes(t));
}

export function filterBashOutput(command: string, output: string): FilterResult {
  if (output === "") {
    return { output: "", savedChars: 0 };
  }

  const stripped = stripAnsi(output);

  // Test commands are never compressed — agents need full failure output
  if (isTestCommand(command)) {
    return { output: stripped, savedChars: output.length - stripped.length };
  }

  let result = stripped;
  try {
    const routes: Array<{ matches: boolean; apply: () => string | null }> = [
      { matches: isGitCommand(command), apply: () => git.compactGitOutput(stripped, command) },
      { matches: isLinterCommand(command), apply: () => linter.aggregateLinterOutput(stripped, command) },
      { matches: isBuildCommand(command), apply: () => build.filterBuildOutput(stripped, command) },
    ];

    for (const route of routes) {
      if (!route.matches) {
        continue;
      }

      const next = route.apply();
      if (next !== null) {
        result = next;
        break;
      }
    }
  } catch {
    result = stripped;
  }

  return {
    output: result,
    savedChars: output.length - result.length,
  };
}

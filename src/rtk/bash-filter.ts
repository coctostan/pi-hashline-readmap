import { stripAnsi } from "./ansi.js";
import * as testOutput from "./test-output.js";

export interface FilterResult {
  output: string;
  savedChars: number;
}

export function isTestCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["vitest", "jest", "pytest", "cargo test", "npm test", "npx vitest"].some((t) => c.includes(t));
}

export function isGitCommand(command: string): boolean {
  const c = command.toLowerCase().trimStart();
  return c === "git" || c.startsWith("git ");
}

export function isBuildCommand(command: string): boolean {
  const c = command.toLowerCase();
  return ["tsc", "cargo", "npm run build"].some((t) => c.includes(t));
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

  let result: string;
  if (isTestCommand(command)) {
    result = testOutput.aggregateTestOutput(stripped, command) ?? stripped;
  } else {
    result = stripped;
  }

  return {
    output: result,
    savedChars: output.length - result.length,
  };
}

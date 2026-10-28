import path from "node:path";
import {
  classifyCommandForContextHygiene,
  normalizeCommandForContextHygiene,
  type ContextHygieneCommandKind,
} from "./context-hygiene.js";

export type BashCommandStateKind =
  | "repo-status"
  | "repo-diff"
  | "git-history"
  | "git-worktree-mutation"
  | "shell-file-mutation"
  | "verification"
  | "routine"
  | "debug";

export type BashCommandOutcome = "success" | "failure";

export interface BuildBashCommandStateInput {
  command: string;
  isError?: boolean;
  text?: string;
  cwd?: string;
}

export interface BashCommandState {
  command: string;
  normalizedCommand: string;
  commandKind: ContextHygieneCommandKind;
  stateKind: BashCommandStateKind;
  outcome: BashCommandOutcome;
  containsDiagnostics: boolean;
  semanticInvalidationSensitive: boolean;
  routineRetirementEligible: boolean;
  protectedFromRoutineRetirement: boolean;
  fileTargets?: string[];
}

const GIT_WORKTREE_MUTATION_RE =
  /^git\s+(add|apply|am|checkout|clean|commit|merge|mv|pull|rebase|reset|restore|rm|stash|switch)\b/;

const REDIRECTION_RE = /(?:^|[\s;|&])(?:\d?>>?|&>|>>|>)\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g;
const TEE_RE = /(?:^|[|;&]\s*)tee((?:\s+(?:"[^"]+"|'[^']+'|[^\s;&|]+))*)/g;

function containsDiagnostics(text: string): boolean {
  return /\b(error TS\d+|TypeError:|ReferenceError:|SyntaxError:|AssertionError:|\bat\s+\S+\s+\([^)]*:\d+:\d+\)|FAIL\b)/.test(text);
}

function isSafeLiteralShellTarget(target: string): boolean {
  if (/[$`*?{}()[\]]/.test(target)) return false;
  if (target.includes("~")) return false;
  if (target.startsWith("-")) return false;
  return true;
}
/** `cwd` is undefined after a `cd` the classifier cannot follow: only absolute targets resolve then. */
function normalizeShellTarget(rawTarget: string, cwd: string | undefined): string | undefined {
  const trimmed = rawTarget.trim();
  if (!trimmed || trimmed === "/dev/null" || /^&\d+$/.test(trimmed)) return undefined;
  if (!isSafeLiteralShellTarget(trimmed)) return undefined;
  if (cwd === undefined) return path.isAbsolute(trimmed) ? path.resolve(trimmed) : undefined;
  return path.resolve(cwd, trimmed);
}

function pushUniqueTarget(targets: string[], target: string | undefined): void {
  if (!target || targets.includes(target)) return;
  targets.push(target);
}

function splitShellWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) words.push(current);
  return words;
}

function extractTeeTargets(command: string, cwd: string | undefined, targets: string[]): void {
  for (const match of command.matchAll(TEE_RE)) {
    const words = splitShellWords(match[1] ?? "");
    for (const word of words) {
      if (word === "-a" || word.startsWith("--")) continue;
      pushUniqueTarget(targets, normalizeShellTarget(word, cwd));
    }
  }
}

function extractSedInPlaceTargets(words: readonly string[], cwd: string | undefined, targets: string[]): void {
  if (words[0] !== "sed") return;

  const inPlaceIndex = words.findIndex((word) => word === "-i" || word.startsWith("-i"));
  if (inPlaceIndex < 0) return;

  let index = inPlaceIndex + 1;
  if (words[inPlaceIndex] === "-i" && words[index] === "") index += 1;

  while (index < words.length && words[index].startsWith("-") && words[index] !== "-") {
    index += 1;
  }

  if (index < words.length) index += 1;

  for (; index < words.length; index += 1) {
    const word = words[index];
    if (!word || word.startsWith("-")) continue;
    pushUniqueTarget(targets, normalizeShellTarget(word, cwd));
  }
}

function nonOptionOperands(words: readonly string[]): string[] {
  const operands: string[] = [];
  for (const word of words) {
    if (!word || word === "--") continue;
    if (word.startsWith("-")) continue;
    operands.push(word);
  }
  return operands;
}

function extractPathCommandTargets(words: readonly string[], cwd: string | undefined, targets: string[]): void {
  const commandName = words[0];
  if (!commandName) return;

  if (commandName === "mv") {
    const operands = nonOptionOperands(words.slice(1));
    if (operands.length === 2) {
      pushUniqueTarget(targets, normalizeShellTarget(operands[0], cwd));
      pushUniqueTarget(targets, normalizeShellTarget(operands[1], cwd));
    }
  }


  if (commandName === "cp") {
    const operands = nonOptionOperands(words.slice(1));
    if (operands.length === 2) {
      pushUniqueTarget(targets, normalizeShellTarget(operands[1], cwd));
    }
  }


  if (commandName === "rm") {
    for (const operand of nonOptionOperands(words.slice(1))) {
      pushUniqueTarget(targets, normalizeShellTarget(operand, cwd));
    }
  }


  if (commandName === "install") {
    const operands = nonOptionOperands(words.slice(1));
    if (operands.length >= 2) {
      pushUniqueTarget(targets, normalizeShellTarget(operands[operands.length - 1], cwd));
    }
  }
}

const HEREDOC_RE = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z0-9_]+))/;

/** Index just past the heredoc bodies that start at `start`, in the order their operators appeared. */
function skipHeredocBodies(command: string, start: number, heredocs: ReadonlyArray<{ delimiter: string; stripTabs: boolean }>): number {
  let index = start;
  for (const { delimiter, stripTabs } of heredocs) {
    while (index < command.length) {
      const newline = command.indexOf("\n", index);
      const lineEnd = newline < 0 ? command.length : newline;
      const line = command.slice(index, lineEnd);
      index = lineEnd + 1;
      if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
    }
  }
  return Math.min(index, command.length);
}

/**
 * Simple commands of a shell command line: split at `&&`, `||`, `;`, `|`, `&` and newlines outside
 * quotes. Heredoc bodies belong to no command. Parentheses are not tracked, so a `cd` inside a
 * subshell is treated as if it persisted.
 */
export function splitShellCommands(command: string): string[] {
  const commands: string[] = [];
  const heredocs: Array<{ delimiter: string; stripTabs: boolean }> = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  const flush = () => {
    if (current.trim()) commands.push(current.trim());
    current = "";
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      current += char;
      if (char === "\\" && quote === '"' && index + 1 < command.length) current += command[++index];
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\\" && index + 1 < command.length) {
      current += char + command[++index];
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    const heredoc = char === "<" && command[index + 2] !== "<" ? HEREDOC_RE.exec(command.slice(index)) : null;
    if (heredoc) {
      heredocs.push({ delimiter: heredoc[2] ?? heredoc[3] ?? heredoc[4], stripTabs: heredoc[1] === "-" });
      current += heredoc[0];
      index += heredoc[0].length - 1;
      continue;
    }
    if (char === "\n") {
      flush();
      index = skipHeredocBodies(command, index + 1, heredocs.splice(0)) - 1;
      continue;
    }
    // `2>&1`, `&>` and `>|` are redirections, not separators.
    const inRedirection = command[index - 1] === ">" || (char === "&" && command[index + 1] === ">");
    if ((char === ";" || char === "|" || char === "&") && !inRedirection) {
      flush();
      if ((char === "&" || char === "|") && command[index + 1] === char) index += 1;
      continue;
    }
    current += char;
  }
  flush();
  return commands;
}

const COMMAND_PREFIX_WORDS = new Set(["!", "{", "(", "then", "do", "else", "time"]);

/** Words of a simple command from its command name on: drops grouping, keywords and `NAME=value` prefixes. */
function commandWords(simpleCommand: string): string[] {
  const words = splitShellWords(simpleCommand);
  let start = 0;
  while (start < words.length) {
    const word = words[start].replace(/^[({]+/, "");
    if (word && !COMMAND_PREFIX_WORDS.has(word) && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      words[start] = word;
      break;
    }
    start += 1;
  }
  return words.slice(start);
}

/** Directory after `cd <args>`; undefined when it cannot be known (`cd`, `cd -`, `cd ~`, `cd $X`). */
function changeDirectory(cwd: string | undefined, args: readonly string[]): string | undefined {
  const operands = nonOptionOperands(args);
  if (operands.length !== 1 || !isSafeLiteralShellTarget(operands[0])) return undefined;
  if (path.isAbsolute(operands[0])) return path.resolve(operands[0]);
  return cwd === undefined ? undefined : path.resolve(cwd, operands[0]);
}

export function extractShellFileMutationTargets(command: string, cwd = process.cwd()): string[] {
  const targets: string[] = [];
  let commandCwd: string | undefined = cwd;
  for (const simpleCommand of splitShellCommands(command)) {
    const words = commandWords(simpleCommand);
    if (words[0] === "eval" || words[0] === "source" || words[0] === ".") continue;
    if (words[0] === "cd") {
      commandCwd = changeDirectory(commandCwd, words.slice(1));
      continue;
    }
    for (const match of simpleCommand.matchAll(REDIRECTION_RE)) {
      pushUniqueTarget(targets, normalizeShellTarget(match[1] ?? match[2] ?? match[3] ?? "", commandCwd));
    }
    extractTeeTargets(simpleCommand, commandCwd, targets);
    extractSedInPlaceTargets(words, commandCwd, targets);
    extractPathCommandTargets(words, commandCwd, targets);
  }
  return targets;
}

function classifyStateKind(
  normalizedCommand: string,
  commandKind: ContextHygieneCommandKind,
  fileTargets: readonly string[],
): BashCommandStateKind {
  if (fileTargets.length > 0) return "shell-file-mutation";
  if (/^git\s+status\b/.test(normalizedCommand)) return "repo-status";
  if (/^git\s+diff\b/.test(normalizedCommand)) return "repo-diff";
  if (/^git\s+log\b/.test(normalizedCommand)) return "git-history";
  if (GIT_WORKTREE_MUTATION_RE.test(normalizedCommand)) return "git-worktree-mutation";
  if (commandKind === "test" || commandKind === "typecheck" || commandKind === "build" || commandKind === "lint") {
    return "verification";
  }
  if (commandKind === "install") return "routine";
  return "debug";
}

export function buildBashCommandState(input: BuildBashCommandStateInput): BashCommandState {
  const normalizedCommand = normalizeCommandForContextHygiene(input.command);
  const commandKind = classifyCommandForContextHygiene(normalizedCommand);
  const fileTargets = extractShellFileMutationTargets(input.command, input.cwd ?? process.cwd());
  const stateKind = classifyStateKind(normalizedCommand, commandKind, fileTargets);
  const outcome: BashCommandOutcome = input.isError === true ? "failure" : "success";
  const diagnostic = containsDiagnostics(input.text ?? "");
  const semanticInvalidationSensitive = stateKind === "repo-status" || stateKind === "repo-diff";
  const protectedFromRoutineRetirement =
    outcome === "failure" ||
    diagnostic ||
    stateKind === "debug" ||
    stateKind === "git-worktree-mutation" ||
    stateKind === "shell-file-mutation";

  return {
    command: input.command,
    normalizedCommand,
    commandKind,
    stateKind,
    outcome,
    containsDiagnostics: diagnostic,
    semanticInvalidationSensitive,
    routineRetirementEligible: outcome === "success" && !protectedFromRoutineRetirement && !semanticInvalidationSensitive,
    protectedFromRoutineRetirement,
    ...(fileTargets.length > 0 ? { fileTargets } : {}),
  };
}
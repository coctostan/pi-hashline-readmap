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

/** What the word after each redirection operator is. */
const REDIRECTION_OPERATORS: Record<string, "write" | "dup" | "ignore" | "heredoc" | "heredoc-strip"> = {
  ">": "write",
  ">>": "write",
  ">|": "write",
  "&>": "write",
  "&>>": "write",
  ">&": "dup",
  "<": "ignore",
  "<&": "ignore",
  "<>": "ignore",
  "<<<": "ignore",
  "<<": "heredoc",
  "<<-": "heredoc-strip",
};
const REDIRECTION_OPERATOR_RE = /^(?:&>>?|>[>|&]?|<<[<-]?|<[&>]?)/;

/** Words that can precede a simple command's name. */
const COMMAND_PREFIX_KEYWORDS = new Set(["!", "{", "if", "then", "elif", "else", "do", "while", "until", "time"]);

function containsDiagnostics(text: string): boolean {
  return /\b(error TS\d+|TypeError:|ReferenceError:|SyntaxError:|AssertionError:|\bat\s+\S+\s+\([^)]*:\d+:\d+\)|FAIL\b)/.test(text);
}

function isSafeLiteralShellTarget(target: string): boolean {
  if (/[$`*?{}()[\]]/.test(target)) return false;
  if (target.includes("~")) return false;
  if (target.startsWith("-")) return false;
  return true;
}
/** `cwd` undefined: a `cd` the classifier could not follow, so only absolute targets are known. */
function normalizeShellTarget(target: string, cwd: string | undefined): string | undefined {
  if (!target || target === "/dev/null") return undefined;
  if (!isSafeLiteralShellTarget(target)) return undefined;
  if (cwd === undefined) return path.isAbsolute(target) ? path.resolve(target) : undefined;
  return path.resolve(cwd, target);
}

function pushUniqueTarget(targets: string[], target: string | undefined): void {
  if (!target || targets.includes(target)) return;
  targets.push(target);
}

/** One simple command: its words with quotes removed, the files its redirections write, and the directory it runs in. */
interface SimpleCommand {
  words: string[];
  writes: string[];
  cwd: string | undefined;
}

interface Heredoc {
  delimiter: string;
  stripTabs: boolean;
}

/** Index of the quote closing the one at `start`; only `'` ignores backslashes. */
function closingQuote(source: string, start: number): number {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\" && quote !== "'") index += 1;
    else if (source[index] === quote) return index;
  }
  return source.length;
}

/** Index just past the heredoc bodies that start at `start`, in the order their operators appeared. */
function skipHeredocBodies(source: string, start: number, heredocs: readonly Heredoc[]): number {
  let index = start;
  for (const { delimiter, stripTabs } of heredocs) {
    while (index < source.length) {
      const newline = source.indexOf("\n", index);
      const lineEnd = newline < 0 ? source.length : newline;
      const line = source.slice(index, lineEnd);
      index = lineEnd + 1;
      if ((stripTabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
    }
  }
  return Math.min(index, source.length);
}

/**
 * Simple commands of a shell command line, split at `;` `&` `&&` `|` `||` `|&` newlines `(` `)`
 * outside quotes. Heredoc bodies and comments belong to no command. `$(…)`, backticks, `<(…)` and
 * `>(…)` are parsed as commands of their own. `${…}`, `$((…))` and `((…))` are inert text except for
 * the substitutions inside them. Inside a substitution (`inSubstitution`), parsing stops at its
 * unmatched `)`, and `end` is that index. Each command's `cwd` follows literal `cd`s from `cwd`;
 * a subshell or substitution keeps its `cd`s inside.
 *
 * shortcut: a subset of bash, the one agents write; known misses: `case` patterns' `)` inside `$(…)`,
 * `$'…'` quoting, `[[ a > b ]]` read as a redirection, a `cd` taken as done even when it fails, sits
 * in a function body, or runs in a pipeline or behind `&`, `CDPATH` ignored. Upgrade to a real bash
 * parser if misses turn up.
 */
function parseShellCommands(
  source: string,
  cwd: string | undefined,
  start = 0,
  inSubstitution = false,
): { commands: SimpleCommand[]; end: number } {
  const commands: SimpleCommand[] = [];
  const heredocs: Heredoc[] = [];
  // The directory each open subshell returns to at its `)`.
  const subshellDirs: (string | undefined)[] = [];
  let command: Omit<SimpleCommand, "cwd"> = { words: [], writes: [] };
  let word = "";
  let inWord = false;
  let quoted = false;
  let pending: (typeof REDIRECTION_OPERATORS)[string] | undefined;

  const endWord = () => {
    if (!inWord) return;
    if (pending === "write" || (pending === "dup" && !/^(?:\d+-?|-)$/.test(word))) command.writes.push(word);
    else if (pending === "heredoc" || pending === "heredoc-strip") heredocs.push({ delimiter: word, stripTabs: pending === "heredoc-strip" });
    else if (pending === undefined) command.words.push(word);
    word = "";
    inWord = quoted = false;
    pending = undefined;
  };
  const endCommand = () => {
    endWord();
    if (command.words.length > 0 || command.writes.length > 0) {
      commands.push({ ...command, cwd });
      const words = commandWords(command.words);
      if (words[0] === "cd") {
        const operands = nonOptionOperands(words.slice(1));
        cwd = operands.length === 1 ? normalizeShellTarget(operands[0], cwd) : undefined;
      }
    }
    command = { words: [], writes: [] };
    pending = undefined;
  };
  const opensExpansion = (at: number): boolean =>
    source[at] === "`" || (source[at] === "$" && (source[at + 1] === "(" || source[at + 1] === "{"));
  // Last index of the expansion opening at `start`; the commands it runs join `commands`.
  const scanExpansion = (start: number): number => {
    if (source[start] === "`") {
      const end = closingQuote(source, start);
      commands.push(...parseShellCommands(source.slice(start + 1, end), cwd).commands);
      return end;
    }
    if (source[start + 1] === "{") return inertSpan(start + 2, "{", "}");
    if (source[start] === "$" && source[start + 2] === "(") return inertSpan(start + 2, "(", ")");
    const inner = parseShellCommands(source, cwd, start + 2, true);
    commands.push(...inner.commands);
    return inner.end;
  };
  // Index of the `close` matching the `open` just before `start`, running only the substitutions between.
  const inertSpan = (start: number, open: string, close: string): number => {
    let depth = 1;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (char === "\\") index += 1;
      else if (char === "'") index = closingQuote(source, index);
      else if (opensExpansion(index)) index = scanExpansion(index);
      else if (char === '"') {
        for (index += 1; index < source.length && source[index] !== '"'; index += 1) {
          if (source[index] === "\\") index += 1;
          else if (opensExpansion(index)) index = scanExpansion(index);
        }
      } else if (char === open) depth += 1;
      else if (char === close && (depth -= 1) === 0) return index;
    }
    return source.length;
  };
  // Appends the expansion opening at `start` to the word and returns its last index. A heredoc delimiter is
  // only quote-removed, so the commands inside it never run.
  const expansion = (start: number): number => {
    const commandCount = commands.length;
    const end = scanExpansion(start);
    if (pending === "heredoc" || pending === "heredoc-strip") commands.length = commandCount;
    word += source.slice(start, end + 1);
    inWord = true;
    return end;
  };

  let index = start;
  for (; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "\\") {
      if (next !== "\n") {
        word += next ?? "";
        inWord = quoted = true;
      }
      index += 1;
    } else if (char === "'") {
      const end = closingQuote(source, index);
      word += source.slice(index + 1, end);
      inWord = quoted = true;
      index = end;
    } else if (char === '"') {
      inWord = quoted = true;
      for (index += 1; index < source.length && source[index] !== '"'; index += 1) {
        if (source[index] === "\\" && /[$`"\\\n]/.test(source[index + 1] ?? "")) {
          index += 1;
          if (source[index] !== "\n") word += source[index];
        } else if (opensExpansion(index)) index = expansion(index);
        else word += source[index];
      }
    } else if (opensExpansion(index) || (next === "(" && (char === "<" || char === ">"))) {
      index = expansion(index);
    } else if (char === ">" || char === "<" || (char === "&" && next === ">")) {
      // A bare fd number right before the operator (`2>`) belongs to it, not to the words.
      if (inWord && !quoted && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else {
        endWord();
      }
      const operator = REDIRECTION_OPERATOR_RE.exec(source.slice(index))![0];
      pending = REDIRECTION_OPERATORS[operator];
      index += operator.length - 1;
    } else if (char === "(" && next === "(" && !inWord) {
      endCommand();
      index = inertSpan(index + 1, "(", ")");
    } else if (char === ")" && inSubstitution && subshellDirs.length === 0) {
      break;
    } else if (char === ";" || char === "&" || char === "|" || char === "(" || char === ")") {
      endCommand();
      if (char === "(") subshellDirs.push(cwd);
      if (char === ")" && subshellDirs.length > 0) cwd = subshellDirs.pop();
    } else if (char === "\n") {
      endCommand();
      index = skipHeredocBodies(source, index + 1, heredocs.splice(0)) - 1;
    } else if (char === " " || char === "\t") {
      endWord();
    } else if (char === "#" && !inWord) {
      const newline = source.indexOf("\n", index);
      index = (newline < 0 ? source.length : newline) - 1;
    } else {
      word += char;
      inWord = true;
    }
  }
  endCommand();
  return { commands, end: index };
}

/** A simple command's words from its name on, past keywords and `NAME=value` prefixes. */
function commandWords(words: readonly string[]): readonly string[] {
  const start = words.findIndex((word) => !COMMAND_PREFIX_KEYWORDS.has(word) && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
  return start < 0 ? [] : words.slice(start);
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


  if (commandName === "rm" || commandName === "tee") {
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

export function extractShellFileMutationTargets(command: string, cwd = process.cwd()): string[] {
  const targets: string[] = [];
  for (const simpleCommand of parseShellCommands(command, cwd).commands) {
    for (const write of simpleCommand.writes) pushUniqueTarget(targets, normalizeShellTarget(write, simpleCommand.cwd));
    const words = commandWords(simpleCommand.words);
    extractSedInPlaceTargets(words, simpleCommand.cwd, targets);
    extractPathCommandTargets(words, simpleCommand.cwd, targets);
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
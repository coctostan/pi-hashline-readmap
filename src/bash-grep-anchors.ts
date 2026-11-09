import { readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { commandWords, parseShellCommands } from "./bash-command-state.js";
import { computeLineHash, splitDisplayLines } from "./hashline.js";

/**
 * Options of each command that take the next word as their value when given alone (`-C 2`,
 * `--glob '*.ts'`), and those that supply the pattern, leaving every positional word a file.
 * shortcut: options missing here read as flags, so their value may count as a file and drop or
 * misdirect `N:content` anchoring; add an option when a miss turns up in use.
 */
const GREP_OPTIONS: Record<string, { short: string; long: ReadonlySet<string> }> = {
  grep: {
    short: "efmABCdD",
    long: new Set(["regexp", "file", "max-count", "after-context", "before-context", "context", "include", "exclude", "exclude-dir", "exclude-from", "label", "binary-files", "devices", "directories", "group-separator"]),
  },
  rg: {
    short: "efgtTmABCMjErd",
    long: new Set(["regexp", "file", "glob", "iglob", "type", "type-not", "type-add", "type-clear", "replace", "max-columns", "max-count", "max-depth", "max-filesize", "threads", "encoding", "color", "colors", "pre", "pre-glob", "sort", "sortr", "path-separator", "ignore-file", "context-separator", "field-match-separator", "field-context-separator", "engine", "dfa-size-limit", "regex-size-limit", "after-context", "before-context", "context"]),
  },
};
const PATTERN_OPTIONS = new Set(["-e", "-f", "--regexp", "--file"]);
const PATH_ROW = /^(.+?):(\d+):(.*)$/;
const LINE_ROW = /^(\d+):(.*)$/;
// shortcut: a file larger than this is never read for anchors, its lines left alone; raise it if real matches go unanchored.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface AnchoredBashGrep {
  text: string;
  /** Anchored rows per absolute file path. */
  files: Map<string, Array<{ line: number; hash: string }>>;
}

function isFile(path: string): boolean {
  try {
    const stat = statSync(path);
    return stat.isFile() && stat.size <= MAX_FILE_BYTES;
  } catch {
    return false;
  }
}

function readLines(path: string): string[] | null {
  try {
    return isFile(path) ? splitDisplayLines(readFileSync(path, "utf8")) : null;
  } catch {
    return null;
  }
}

/** The words a grep/rg command searches: its positional words, less the pattern unless an option gave it. */
function fileOperands(name: string, args: readonly string[]): string[] {
  const { short, long } = GREP_OPTIONS[name];
  const positional: string[] = [];
  let patternGiven = false;
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    if (word === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (word === "-" || !word.startsWith("-")) {
      positional.push(word);
    } else if (word.startsWith("--")) {
      const [flag, value] = word.split(/=(.*)/s);
      if (PATTERN_OPTIONS.has(flag)) patternGiven = true;
      if (value === undefined && long.has(flag.slice(2))) i++;
    } else {
      // A cluster like `-rnC2`: its first value-taking letter takes the rest, or else the next word.
      for (let j = 1; j < word.length; j++) {
        if (PATTERN_OPTIONS.has(`-${word[j]}`)) patternGiven = true;
        if (!short.includes(word[j])) continue;
        if (j === word.length - 1) i++;
        break;
      }
    }
  }
  return patternGiven ? positional : positional.slice(1);
}

/** `word` as an absolute path from `dir`, which is undefined after a `cd` the parser could not follow. */
function pathFrom(dir: string | undefined, word: string): string | undefined {
  if (isAbsolute(word)) return word;
  return dir === undefined ? undefined : resolve(dir, word);
}

/**
 * Give each `path:N:content` line of a bash `grep`/`rg` result, and each `N:content` line when
 * the command names exactly one file, an `N:HASH|` anchor when it equals line N of that file on
 * disk inside `cwd`. Every other line, and the command, stay as they are.
 */
export function anchorBashGrepOutput(command: string, text: string, cwd: string): AnchoredBashGrep {
  const files: AnchoredBashGrep["files"] = new Map();
  const greps = parseShellCommands(command, cwd)
    .commands.map(({ words: all, cwd: dir }) => {
      const words = commandWords(all);
      return { name: basename(words[0] ?? ""), args: words.slice(1), dir };
    })
    .filter(({ name }) => name in GREP_OPTIONS);
  if (greps.length === 0) return { text, files };

  const named = new Set(
    greps.flatMap(({ name, args, dir }) =>
      fileOperands(name, args).flatMap((word) => pathFrom(dir, word) ?? []).filter(isFile),
    ),
  );
  const onlyFile = named.size === 1 ? [...named][0] : undefined;
  // shortcut: paths resolve from the first grep/rg's directory; a line from a later one in another directory stays bare.
  const base = greps[0].dir;

  const cache = new Map<string, string[] | null>();
  const lines = (path: string): string[] | null => {
    if (!cache.has(path)) cache.set(path, readLines(path));
    return cache.get(path)!;
  };
  const anchor = (path: string, prefix: string, lineText: string, content: string): string | undefined => {
    const fromCwd = relative(cwd, path);
    if (isAbsolute(fromCwd) || fromCwd.split(sep)[0] === "..") return undefined;
    const line = Number(lineText);
    const onDisk = lines(path)?.[line - 1];
    if (onDisk === undefined || onDisk.replace(/\r$/, "") !== content.replace(/\r$/, "")) return undefined;
    const hash = computeLineHash(line, onDisk);
    files.set(path, [...(files.get(path) ?? []), { line, hash }]);
    return `${prefix}${line}:${hash}|${content}`;
  };

  const anchored = text.split("\n").map((row) => {
    const withPath = PATH_ROW.exec(row);
    const pathOfRow = withPath ? pathFrom(base, withPath[1]) : undefined;
    const viaPath = pathOfRow && anchor(pathOfRow, `${withPath![1]}:`, withPath![2], withPath![3]);
    if (viaPath) return viaPath;
    const bare = onlyFile ? LINE_ROW.exec(row) : null;
    return (bare && anchor(onlyFile!, "", bare[1], bare[2])) || row;
  });
  return { text: anchored.join("\n"), files };
}

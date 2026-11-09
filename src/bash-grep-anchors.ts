import { readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { commandWords, parseShellCommands } from "./bash-command-state.js";
import { computeLineHash, splitDisplayLines } from "./hashline.js";

const GREP_COMMANDS = new Set(["grep", "rg"]);
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

/**
 * Give each `path:N:content` line of a bash `grep`/`rg` result, and each `N:content` line when
 * the command names exactly one file, an `N:HASH|` anchor when it equals line N of that file on
 * disk inside `cwd`. Every other line, and the command, stay as they are.
 */
export function anchorBashGrepOutput(command: string, text: string, cwd: string): AnchoredBashGrep {
  const files: AnchoredBashGrep["files"] = new Map();
  const greps = parseShellCommands(command, cwd)
    .commands.map((simple) => ({ words: commandWords(simple.words), cwd: simple.cwd ?? cwd }))
    .filter(({ words }) => GREP_COMMANDS.has(basename(words[0] ?? "")));
  if (greps.length === 0) return { text, files };

  const named = new Set(
    greps.flatMap(({ words, cwd: dir }) =>
      words.slice(1).filter((word) => !word.startsWith("-")).map((word) => resolve(dir, word)).filter(isFile),
    ),
  );
  const onlyFile = named.size === 1 ? [...named][0] : undefined;
  // shortcut: paths resolve from the first grep/rg's directory; a line from a later one in another directory stays bare.
  const base = greps[0].cwd;

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
    const viaPath = withPath && anchor(resolve(base, withPath[1]), `${withPath[1]}:`, withPath[2], withPath[3]);
    if (viaPath) return viaPath;
    const bare = onlyFile ? LINE_ROW.exec(row) : null;
    return (bare && anchor(onlyFile!, "", bare[1], bare[2])) || row;
  });
  return { text: anchored.join("\n"), files };
}

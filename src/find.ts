import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFileSync, execFile } from "node:child_process";
import { resolve, relative, join } from "node:path";
import { resolveToCwd } from "./path-utils.js";

const MAX_BYTES = 50 * 1024; // 50 KB
const DEFAULT_LIMIT = 1000;


export interface FindEntry {
  path: string;
  type: "file" | "dir";
}

export interface FindPtcValue {
  tool: "find";
  pattern: string;
  totalEntries: number;
  truncated: boolean;
  entries: FindEntry[];
}

export function isFdAvailable(): boolean {
  try {
    execFileSync("fd", ["--version"], { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** @internal — testable indirection for module-level state */
export const _testable = {
  isFdAvailable,
  fdHintShown: false,
};
/** @internal — test-only helper to reset the one-time hint flag */
export function _resetFdHintForTesting(): void {
  _testable.fdHintShown = false;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Load .gitignore at a specific directory and return an ignore instance.
 */
async function loadGitignore(dir: string): Promise<any | null> {
  const ignore = (await import("ignore" as any)).default;
  const gitignorePath = join(dir, ".gitignore");
  try {
    const content = await readFile(gitignorePath, "utf-8");
    const ig = ignore();
    ig.add(content);
    return ig;
  } catch {
    return null;
  }
}

async function findWithNodeFallback(
  searchPath: string,
  pattern: string,
  type: "file" | "dir" | "any",
  maxDepth?: number,
): Promise<FindEntry[]> {
  const picomatch = (await import("picomatch" as any)).default;
  const isMatch = picomatch(pattern, { basename: true, dot: true });
  const ignore = (await import("ignore" as any)).default;

  const entries: FindEntry[] = [];

  // Stack of ignore instances — each directory can add its own
  async function walk(
    dir: string,
    depth: number,
    parentIgnores: Array<{ ig: any; base: string }>,
  ): Promise<void> {
    if (maxDepth !== undefined && depth > maxDepth) return;

    // Check for .gitignore at this directory level
    const localIgnores = [...parentIgnores];
    const localIg = await loadGitignore(dir);
    if (localIg) {
      localIgnores.push({ ig: localIg, base: dir });
    }

    let dirents;
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or similar
    }

    for (const dirent of dirents) {
      const fullPath = join(dir, dirent.name);
      const relFromRoot = normalizePath(relative(searchPath, fullPath));

      // Skip .git directory
      if (dirent.name === ".git" && dirent.isDirectory()) continue;

      // Check ignore rules — each ignore instance checks paths relative to its base
      let ignored = false;
      for (const { ig, base } of localIgnores) {
        const relFromBase = normalizePath(relative(base, fullPath));
        const checkPath = dirent.isDirectory() ? relFromBase + "/" : relFromBase;
        if (ig.ignores(checkPath)) {
          ignored = true;
          break;
        }
      }
      if (ignored) continue;

      if (dirent.isDirectory()) {
        if ((type === "dir" || type === "any") && isMatch(dirent.name)) {
          entries.push({ path: relFromRoot, type: "dir" });
        }
        await walk(fullPath, depth + 1, localIgnores);
      } else {
        if ((type === "file" || type === "any") && isMatch(dirent.name)) {
          entries.push({ path: relFromRoot, type: "file" });
        }
      }
    }
  }

  // Start with a root-level ignore that always excludes .git
  const rootIg = ignore();
  rootIg.add(".git");
  await walk(searchPath, 1, [{ ig: rootIg, base: searchPath }]);

  // Sort lexicographically by path
  entries.sort((a, b) => a.path.localeCompare(b.path));

  return entries;
}

async function findWithFd(
  searchPath: string,
  pattern: string,
  type: "file" | "dir" | "any",
  maxDepth?: number,
): Promise<FindEntry[]> {
  return new Promise((resolve_, reject) => {
    const args: string[] = ["--glob", pattern, "--hidden", "--color", "never"];

    if (type === "file") args.push("--type", "f");
    else if (type === "dir") args.push("--type", "d");

    if (maxDepth !== undefined) args.push("--max-depth", String(maxDepth));

    args.push(".");

    execFile("fd", args, { maxBuffer: 10 * 1024 * 1024, cwd: searchPath }, (err, stdout, _stderr) => {
      if (err && !stdout) {
        // fd returns exit code 1 when no matches found
        if ((err as any).code === 1) {
          resolve_([]);
          return;
        }
        reject(err);
        return;
      }

      const lines = stdout.trim().split("\n").filter((l) => l.length > 0);
      const entries: FindEntry[] = [];

      for (const line of lines) {
        // fd outputs paths relative to its search directory
        let relPath = normalizePath(line.trim());
        // Remove leading ./ if present
        if (relPath.startsWith("./")) relPath = relPath.slice(2);
        // Remove trailing / (fd adds it for directories)
        if (relPath.endsWith("/")) relPath = relPath.slice(0, -1);
        if (!relPath || relPath.startsWith("..")) continue;

        if (type === "file") {
          entries.push({ path: relPath, type: "file" });
        } else if (type === "dir") {
          entries.push({ path: relPath, type: "dir" });
        } else {
          // For "any", we need to determine the type
          try {
            const { statSync } = require("node:fs");
            const fullPath = resolve(searchPath, relPath);
            const s = statSync(fullPath);
            entries.push({ path: relPath, type: s.isDirectory() ? "dir" : "file" });
          } catch {
            entries.push({ path: relPath, type: "file" });
          }
        }
      }

      entries.sort((a, b) => a.path.localeCompare(b.path));
      resolve_(entries);
    });
  });
}

function formatOutput(
  entries: FindEntry[],
  totalCount: number,
  truncated: boolean,
  pattern: string,
  showFdHint: boolean,
): string {
  if (entries.length === 0 && !truncated) {
    const text = `No files found matching pattern: ${pattern}`;
    return showFdHint ? text + "\nHint: Install fd for faster file discovery: brew install fd" : text;
  }

  const lines: string[] = [];
  for (const e of entries) {
    lines.push(e.type === "dir" ? `${e.path}/` : e.path);
  }
  if (truncated) {
    const remaining = totalCount - entries.length;
    lines.push(`[… ${remaining} more entries — refine pattern or increase limit]`);
  }
  if (showFdHint) {
    lines.push("Hint: Install fd for faster file discovery: brew install fd");
  }

  let text = lines.join("\n");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_BYTES) {
    text = Buffer.from(text, "utf8").subarray(0, MAX_BYTES).toString("utf8") + "\n[… truncated at 50 KB]";
  }
  return text;
}

export function registerFindTool(pi: ExtensionAPI) {
  const tool = {
    name: "find",
    label: "find",
    description: "Find files recursively matching a glob pattern. Respects .gitignore, includes hidden files, returns sorted relative paths with structured metadata.",
    parameters: Type.Object(
      {
        pattern: Type.String({ description: "Glob pattern (e.g. '*.ts', '*.test.ts')" }),
        path: Type.Optional(Type.String({ description: "Directory to search (default: cwd)" })),
        limit: Type.Optional(Type.Number({ description: "Max entries to return (default: 1000)" })),
        type: Type.Optional(
          Type.Union(
            [Type.Literal("file"), Type.Literal("dir"), Type.Literal("any")],
            { description: 'Filter by entry type (default: "file")' },
          ),
        ),
        maxDepth: Type.Optional(Type.Number({ description: "Maximum directory depth" })),
      },
      { required: ["pattern"] },
    ),

    async execute(
      _toolCallId: string,
      params: { pattern: string; path?: string; limit?: number; type?: "file" | "dir" | "any"; maxDepth?: number },
      _signal: AbortSignal | undefined,
      _onUpdate: any,
      ctx: any,
    ) {
      const cwd: string = ctx?.cwd ?? process.cwd();
      const searchPath = params.path ? resolveToCwd(params.path, cwd) : cwd;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const type = params.type ?? "file";
      const pattern = params.pattern;

      // Check if path exists
      try {
        const s = await stat(searchPath);
        if (!s.isDirectory()) {
          return {
            content: [{ type: "text" as const, text: `Error: '${params.path ?? searchPath}' is not a directory` }],
            isError: true,
            details: {},
          };
        }
      } catch {
        return {
          content: [{ type: "text" as const, text: `Error: path '${params.path ?? searchPath}' does not exist` }],
          isError: true,
          details: {},
        };
      }

      const useFd = _testable.isFdAvailable();
      const showFdHint = !useFd && !_testable.fdHintShown;
      if (showFdHint) _testable.fdHintShown = true;

      let allEntries: FindEntry[];
      if (useFd) {
        allEntries = await findWithFd(searchPath, pattern, type, params.maxDepth);
      } else {
        allEntries = await findWithNodeFallback(searchPath, pattern, type, params.maxDepth);
      }

      const totalCount = allEntries.length;
      const truncated = totalCount > limit;
      const displayed = truncated ? allEntries.slice(0, limit) : allEntries;

      const outputText = formatOutput(displayed, totalCount, truncated, pattern, showFdHint);
      const ptcValue: FindPtcValue = {
        tool: "find",
        pattern,
        totalEntries: totalCount,
        truncated,
        entries: displayed,
      };

      return {
        content: [{ type: "text" as const, text: outputText }],
        details: { ptcValue },
      };
    },

    renderCall(args: any, theme: any) {
      const { pattern, path } = args as { pattern: string; path?: string };
      const label = theme.fg("toolTitle", "🔍 find");
      const target = path ? `${pattern} in ${path}` : pattern;
      return new Text(`${label} ${theme.fg("muted", target)}`, 0, 0);
    },

    renderResult(result: any, _options: any, theme: any) {
      const output =
        result.content[0]?.type === "text"
          ? (result.content[0] as { type: "text"; text: string }).text
          : "";
      const lineCount = output.split("\n").filter((l: string) => l.length > 0 && !l.startsWith("[") && !l.startsWith("Hint")).length;
      const summary = lineCount > 0 ? `${lineCount} results` : "no results";
      return new Text(theme.fg("toolOutput", summary), 0, 0);
    },
  };

  pi.registerTool(tool as any);
  return tool;
}

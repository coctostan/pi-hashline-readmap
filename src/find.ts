import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFileSync, execFile } from "node:child_process";
import { resolve, relative, join } from "node:path";
import { resolveToCwd } from "./path-utils.js";
import * as findStat from "./find-stat.js";
import { parseRelativeOrIsoDate, parseSize } from "./find-parsers.js";
import { buildPtcError } from "./ptc-value.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, linkToolPath, renderToolLabel, summaryLine } from "./tui-render-utils.js";

const MAX_BYTES = 50 * 1024; // 50 KB
const DEFAULT_LIMIT = 1000;
const FIND_PROMPT_METADATA = defineToolPromptMetadata({
  promptUrl: new URL("../prompts/find.md", import.meta.url),
  promptSnippet: "Find files recursively by name, respecting gitignore",
  promptGuidelines: [
    "Use find for recursive file-name discovery; use ls for one directory.",
    "Use find path plus basename pattern rather than shell find commands.",
    "Use find filters and sorting before limit for newest/largest file queries.",
  ],
});

export const FIND_PTC = {
  callable: true,
  enabled: true,
  policy: "read-only" as const,
  readOnly: true,
  pythonName: "find",
  defaultExposure: "safe-by-default" as const,
};


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
  matcher: (basename: string) => boolean,
  type: "file" | "dir" | "any",
  maxDepth?: number,
): Promise<FindEntry[]> {
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
        if ((type === "dir" || type === "any") && matcher(dirent.name)) {
          entries.push({ path: relFromRoot, type: "dir" });
        }
        await walk(fullPath, depth + 1, localIgnores);
      } else {
        if ((type === "file" || type === "any") && matcher(dirent.name)) {
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

async function findWithFdRegex(
  searchPath: string,
  matcher: (basename: string) => boolean,
  type: "file" | "dir" | "any",
  maxDepth?: number,
): Promise<FindEntry[]> {
  return new Promise((resolve_, reject) => {
    const args: string[] = ["--glob", "*", "--hidden", "--color", "never"];
    if (type === "file") args.push("--type", "f");
    else if (type === "dir") args.push("--type", "d");
    if (maxDepth !== undefined) args.push("--max-depth", String(maxDepth));
    args.push(".");
    execFile("fd", args, { maxBuffer: 10 * 1024 * 1024, cwd: searchPath }, (err, stdout, _stderr) => {
      if (err && !stdout) {
        if ((err as any).code === 1) return resolve_([]);
        return reject(err);
      }
      const lines = stdout.trim().split("\n").filter((l) => l.length > 0);
      const entries: FindEntry[] = [];
      for (const line of lines) {
        let relPath = normalizePath(line.trim());
        if (relPath.startsWith("./")) relPath = relPath.slice(2);
        const hadTrailingSlash = relPath.endsWith("/");
        if (hadTrailingSlash) relPath = relPath.slice(0, -1);
        if (!relPath || relPath.startsWith("..")) continue;
        const name = relPath.split("/").pop() ?? relPath;
        if (!matcher(name)) continue;
        if (type === "file") entries.push({ path: relPath, type: "file" });
        else if (type === "dir") entries.push({ path: relPath, type: "dir" });
        else if (hadTrailingSlash) entries.push({ path: relPath, type: "dir" });
        else entries.push({ path: relPath, type: "file" });
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
  const tool: Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof FIND_PTC } = {
    name: "find",
    label: "find",
    description: FIND_PROMPT_METADATA.description,
    promptSnippet: FIND_PROMPT_METADATA.promptSnippet,
    promptGuidelines: FIND_PROMPT_METADATA.promptGuidelines,
    ptc: FIND_PTC,
    parameters: Type.Object(
      {
        pattern: Type.String({ description: "Glob or basename pattern" }),
        path: Type.Optional(Type.String({ description: "Search root" })),
        limit: Type.Optional(Type.Number({ description: "Max entries" })),
        type: Type.Optional(
          Type.Union(
            [Type.Literal("file"), Type.Literal("dir"), Type.Literal("any")],
            { description: "Entry type filter" },
          ),
        ),
        maxDepth: Type.Optional(Type.Number({ description: "Max directory depth" })),
        regex: Type.Optional(
          Type.Boolean({ description: "Treat pattern as regex" }),
        ),
        sortBy: Type.Optional(
          Type.Union(
            [Type.Literal("name"), Type.Literal("mtime"), Type.Literal("size")],
            { description: "Sort key" },
          ),
        ),
        reverse: Type.Optional(
          Type.Boolean({ description: "Reverse sort order" }),
        ),
        modifiedSince: Type.Optional(Type.String({ description: "Modified after time" })),
        minSize: Type.Optional(
          Type.Union([Type.Number(), Type.String()], { description: "Minimum file size" }),
        ),
        maxSize: Type.Optional(
          Type.Union([Type.Number(), Type.String()], { description: "Maximum file size" }),
        ),
      },
      { required: ["pattern"] },
    ),
    async execute(
      _toolCallId: string,
      params: {
        pattern: string;
        path?: string;
        limit?: number;
        type?: "file" | "dir" | "any";
        maxDepth?: number;
        regex?: boolean;
        sortBy?: "name" | "mtime" | "size";
        reverse?: boolean;
        modifiedSince?: string;
        minSize?: number | string;
        maxSize?: number | string;
      },
      _signal: AbortSignal | undefined,
      _onUpdate: any,
      ctx: any,
    ) {
      const cwd: string = ctx?.cwd ?? process.cwd();
      const searchPath = params.path ? resolveToCwd(params.path, cwd) : cwd;
      const limit = params.limit ?? DEFAULT_LIMIT;
      const type = params.type ?? "file";
      const pattern = params.pattern;
      const maxDepthCoerced = coerceObviousBase10Int(params.maxDepth, "maxDepth");
      if (!maxDepthCoerced.ok) {
        const message = `Error: ${maxDepthCoerced.message}`;
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "find" as const,
              ok: false,
              path: params.path ?? searchPath,
              error: buildPtcError("invalid-params-combo", maxDepthCoerced.message),
            },
          },
        };
      }
      if (maxDepthCoerced.value !== undefined && maxDepthCoerced.value < 0) {
        const message = `Invalid maxDepth: expected a non-negative integer, received ${maxDepthCoerced.value}.`;
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
          details: {
            ptcValue: {
              tool: "find" as const,
              ok: false,
              path: params.path ?? searchPath,
              error: buildPtcError("invalid-params-combo", message),
            },
          },
        };
      }
      params = { ...params, maxDepth: maxDepthCoerced.value };

      // Check if path exists
      try {
        const s = await stat(searchPath);
        if (!s.isDirectory()) {
          const message = `Error: '${params.path ?? searchPath}' is not a directory`;
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
            details: {
              ptcValue: {
                tool: "find",
                ok: false,
                path: params.path ?? searchPath,
                error: buildPtcError(
                  "path-not-directory",
                  message,
                  `Use ls on a directory, or read(${JSON.stringify(params.path ?? searchPath)}) for a single file.`,
                ),
              },
            },
          };
        }
      } catch (err: any) {
        const target = params.path ?? searchPath;
        const code =
          err?.code === "EACCES" || err?.code === "EPERM"
            ? "permission-denied"
            : err?.code === "ENOENT"
              ? "path-not-found"
              : "fs-error";
        const message =
          code === "permission-denied"
            ? `Error: permission denied for path '${target}'`
            : code === "path-not-found"
              ? `Error: path '${target}' does not exist`
              : `Error: could not access path '${target}': ${err?.message ?? String(err)}`;
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "find",
              ok: false,
              path: target,
              error: buildPtcError(code, message, undefined, code === "fs-error"
                ? { fsCode: err?.code, fsMessage: err?.message }
                : undefined),
            },
          },
        };
      }

      const useFd = _testable.isFdAvailable();
      const showFdHint = !useFd && !_testable.fdHintShown;
      if (showFdHint) _testable.fdHintShown = true;

      let matcher: (basename: string) => boolean;
      if (params.regex) {
        let re: RegExp;
        try {
          re = new RegExp(pattern);
        } catch (err) {
          const message =
            `Error: invalid regex for fields 'pattern'/'regex' ` +
            `(${JSON.stringify(pattern)}): ${(err as Error).message}`;
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
            details: {
              ptcValue: {
                tool: "find",
                ok: false,
                path: params.path ?? searchPath,
                error: buildPtcError("invalid-params-combo", message),
              },
            },
          };
        }
        matcher = (basename: string) => re.test(basename);
      } else {
        const picomatch = (await import("picomatch" as any)).default;
        const isMatch = picomatch(pattern, { basename: true, dot: true });
        matcher = (basename: string) => isMatch(basename);
      }
      let allEntries: FindEntry[];
      if (useFd) {
        allEntries = params.regex
          ? await findWithFdRegex(searchPath, matcher, type, params.maxDepth)
          : await findWithFd(searchPath, pattern, type, params.maxDepth);
      } else {
        allEntries = await findWithNodeFallback(searchPath, matcher, type, params.maxDepth);
      }

      let modifiedSinceMs: number | null = null;
      let minSizeBytes: number | null = null;
      let maxSizeBytes: number | null = null;
      try {
        if (params.modifiedSince !== undefined) {
          modifiedSinceMs = parseRelativeOrIsoDate("modifiedSince", params.modifiedSince).getTime();
        }
        if (params.minSize !== undefined) {
          minSizeBytes = parseSize("minSize", params.minSize);
        }
        if (params.maxSize !== undefined) {
          maxSizeBytes = parseSize("maxSize", params.maxSize);
        }
      } catch (err) {
        const message = `Error: ${(err as Error).message}`;
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "find",
              ok: false,
              path: params.path ?? searchPath,
              error: buildPtcError("invalid-params-combo", message),
            },
          },
        };
      }
      const sortBy = params.sortBy ?? "name";
      const dir = params.reverse ? -1 : 1;
      const needsStat =
        sortBy === "mtime" ||
        sortBy === "size" ||
        modifiedSinceMs !== null ||
        minSizeBytes !== null ||
        maxSizeBytes !== null;
      let statsByIndex: (import("node:fs").Stats | null)[] = [];
      if (needsStat) {
        statsByIndex = await findStat.statAllWithConcurrency(
          allEntries.map((e) => e.path),
          searchPath,
        );
      }
      const filtered: Array<{ entry: FindEntry; st: import("node:fs").Stats | null }> = [];
      for (let i = 0; i < allEntries.length; i++) {
        const entry = allEntries[i];
        const st = needsStat ? statsByIndex[i] ?? null : null;
        if (modifiedSinceMs !== null) {
          if (!st) continue;
          if (st.mtimeMs <= modifiedSinceMs) continue;
        }
        if ((minSizeBytes !== null || maxSizeBytes !== null) && entry.type === "file") {
          if (!st) continue;
          if (minSizeBytes !== null && st.size < minSizeBytes) continue;
          if (maxSizeBytes !== null && st.size > maxSizeBytes) continue;
        }
        filtered.push({ entry, st });
      }
      filtered.sort((a, b) => {
        if (sortBy === "mtime") {
          const cmp = ((a.st?.mtimeMs ?? 0) - (b.st?.mtimeMs ?? 0)) * dir;
          if (cmp !== 0) return cmp;
          return a.entry.path.localeCompare(b.entry.path);
        }
        if (sortBy === "name") {
          return a.entry.path.localeCompare(b.entry.path) * dir;
        }
        if (sortBy === "size") {
          const cmp = ((a.st?.size ?? 0) - (b.st?.size ?? 0)) * dir;
          if (cmp !== 0) return cmp;
          return a.entry.path.localeCompare(b.entry.path);
        }
        return a.entry.path.localeCompare(b.entry.path);
      });
      allEntries = filtered.map((d) => d.entry);

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

    renderCall(args: any, theme: any, context: any = {}) {
      const { pattern, path } = args as { pattern: string; path?: string };
      const cwd = context.cwd ?? process.cwd();
      const label = renderToolLabel(theme, "find");
      const target = path
        ? `${theme.fg("muted", pattern)}${theme.fg("muted", " in ")}${linkToolPath(theme.fg("muted", path), path, cwd)}`
        : theme.fg("muted", pattern);
      return new Text(clampLineToWidth(`${label} ${target}`, context.width), 0, 0);
    },

    renderResult(result: any, options: any, theme: any, context: any = {}) {
      const expanded = isRendererExpanded(options, context);
      const width = context.width ?? options?.width;
      const output = result.content[0]?.type === "text" ? (result.content[0] as { type: "text"; text: string }).text : "";
      if (result.isError || context.isError) {
        const firstLine = output.split("\n")[0] || "error";
        const body = expanded && output ? output : firstLine;
        return new Text(clampLinesToWidth(summaryLine(body).split("\n"), width).join("\n"), 0, 0);
      }
      const ptcValue = result.details?.ptcValue as { totalEntries?: number } | undefined;
      const total = ptcValue?.totalEntries ?? output.split("\n").filter((l: string) => l.length > 0 && !l.startsWith("[") && !l.startsWith("Hint")).length;
      if (total === 0) return new Text(summaryLine("no results"), 0, 0);
      let text = summaryLine(`${total} ${total === 1 ? "result" : "results"} returned`, { hidden: !!output && !expanded });
      if (expanded && output) text += `\n${output}`;
      return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
    },
  };

  pi.registerTool(tool);
  return tool;
}

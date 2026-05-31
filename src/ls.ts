import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { readdir, stat } from "node:fs/promises";
import { resolveToCwd } from "./path-utils.js";
import { buildPtcError } from "./ptc-value.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, linkToolPath, renderToolLabel, summaryLine } from "./tui-render-utils.js";

const MAX_BYTES = 50 * 1024; // 50 KB
const DEFAULT_LIMIT = 500;

const LS_PROMPT_METADATA = defineToolPromptMetadata({
  promptUrl: new URL("../prompts/ls.md", import.meta.url),
  promptSnippet: "List one directory with directories first and dotfiles included",
  promptGuidelines: [
    "Use ls to inspect one directory; use find for recursive discovery.",
    "Use ls glob to narrow a single-directory listing.",
    "Use read, not ls, for file contents.",
  ],
});

export const LS_PTC = {
  callable: true,
  enabled: true,
  policy: "read-only" as const,
  readOnly: true,
  pythonName: "ls",
  defaultExposure: "safe-by-default" as const,
};

export interface LsEntry {
  name: string;
  type: "file" | "dir";
}

export interface LsPtcValue {
  tool: "ls";
  path: string;
  totalEntries: number;
  truncated: boolean;
  entries: LsEntry[];
}

function sortEntries(entries: LsEntry[]): LsEntry[] {
  const dirs = entries.filter((e) => e.type === "dir");
  const files = entries.filter((e) => e.type === "file");
  const cmp = (a: LsEntry, b: LsEntry) => {
    const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    return lower !== 0 ? lower : a.name.localeCompare(b.name);
  };
  dirs.sort(cmp);
  files.sort(cmp);
  return [...dirs, ...files];
}

function formatOutput(entries: LsEntry[], totalCount: number, truncated: boolean): string {
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(e.type === "dir" ? `${e.name}/` : e.name);
  }
  if (truncated) {
    const remaining = totalCount - entries.length;
    lines.push(`[… ${remaining} more entries — use glob to narrow results]`);
  }
  if (entries.length === 0 && !truncated) {
    return "(empty directory)";
  }
  let text = lines.join("\n");
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > MAX_BYTES) {
    text = Buffer.from(text, "utf8").subarray(0, MAX_BYTES).toString("utf8") + "\n[… truncated at 50 KB]";
  }
  return text;
}

function validateGlobBalance(glob: string): string | null {
  let brackets = 0;
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "[") brackets++;
    else if (ch === "]") {
      if (brackets === 0) return "Unmatched ']'.";
      brackets--;
    } else if (ch === "{") braces++;
    else if (ch === "}") {
      if (braces === 0) return "Unmatched '}'.";
      braces--;
    }
  }
  if (brackets !== 0) return "Unterminated character class.";
  if (braces !== 0) return "Unterminated brace expansion.";
  return null;
}

export function registerLsTool(pi: ExtensionAPI) {
  const tool: Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof LS_PTC } = {
    name: "ls",
    label: "ls",
    description: LS_PROMPT_METADATA.description,
    promptSnippet: LS_PROMPT_METADATA.promptSnippet,
    promptGuidelines: LS_PROMPT_METADATA.promptGuidelines,
    ptc: LS_PTC,
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Directory path" })),
      limit: Type.Optional(
        Type.Union(
          [Type.Number(), Type.String()],
          { description: "Max entries" },
        ),
      ),
      glob: Type.Optional(Type.String({ description: "Glob filter" })),
    }),
    async execute(
      _toolCallId: string,
      params: { path?: string; limit?: number | string; glob?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: any,
      ctx: any,
    ) {
      const cwd: string = ctx?.cwd ?? process.cwd();
      const targetPath = params.path ? resolveToCwd(params.path, cwd) : cwd;
      const limitCoerced = coerceObviousBase10Int(params.limit, "limit");
      if (!limitCoerced.ok) {
        return {
          content: [{ type: "text" as const, text: limitCoerced.message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "ls" as const,
              ok: false,
              path: params.path ?? targetPath,
              error: buildPtcError("invalid-limit", limitCoerced.message),
            },
          },
        };
      }
      if (limitCoerced.value !== undefined && limitCoerced.value < 1) {
        const message = `Invalid limit: expected a positive integer, received ${limitCoerced.value}.`;
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "ls" as const,
              ok: false,
              path: params.path ?? targetPath,
              error: buildPtcError("invalid-limit", message),
            },
          },
        };
      }
      const limit = limitCoerced.value ?? DEFAULT_LIMIT;

      // Check if path exists and is a directory
      let pathStat;
      try {
        pathStat = await stat(targetPath);
      } catch (err: any) {
        const target = params.path ?? targetPath;
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
              tool: "ls",
              ok: false,
              path: target,
              error: buildPtcError(code, message, undefined, code === "fs-error"
                ? { fsCode: err?.code, fsMessage: err?.message }
                : undefined),
            },
          },
        };
      }
      if (!pathStat.isDirectory()) {
        const message = `Error: '${params.path ?? targetPath}' is a file, not a directory. Use read to inspect files.`;
        return {
          content: [{ type: "text" as const, text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "ls",
              ok: false,
              path: params.path ?? targetPath,
              error: buildPtcError(
                "path-not-directory",
                message,
                `Use read(${JSON.stringify(params.path ?? targetPath)}) to inspect files.`,
              ),
            },
          },
        };
      }

      // Read directory
      const dirents = await readdir(targetPath, { withFileTypes: true });
      let allEntries: LsEntry[] = dirents.map((d) => ({
        name: d.name,
        type: d.isDirectory() ? ("dir" as const) : ("file" as const),
      }));

      // Apply glob filter
      if (params.glob) {
        const balanceError = validateGlobBalance(params.glob);
        if (balanceError) {
          const message = `Invalid glob ${JSON.stringify(params.glob)}: ${balanceError}`;
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
            details: {
              ptcValue: {
                tool: "ls" as const,
                ok: false,
                path: params.path ?? targetPath,
                error: buildPtcError("invalid-params-combo", message),
              },
            },
          };
        }
        const picomatch = (await import("picomatch" as any)).default;
        const isMatch = picomatch(params.glob);
        allEntries = allEntries.filter((e) => isMatch(e.name));
      }

      // Sort: dirs first, then files, each group alpha case-insensitive
      const sorted = sortEntries(allEntries);
      const totalCount = sorted.length;
      const truncated = totalCount > limit;
      const displayed = truncated ? sorted.slice(0, limit) : sorted;

      const text = formatOutput(displayed, totalCount, truncated);
      const ptcValue: LsPtcValue = {
        tool: "ls",
        path: targetPath,
        totalEntries: totalCount,
        truncated,
        entries: displayed,
      };

      return {
        content: [{ type: "text" as const, text }],
        details: { ptcValue },
      };
    },

    renderCall(args: any, theme: any, context: any = {}) {
      const { path } = args as { path?: string };
      const cwd = context.cwd ?? process.cwd();
      const displayPath = path ?? ".";
      const linkedPath = linkToolPath(theme.fg("muted", displayPath), displayPath, cwd);
      return new Text(clampLineToWidth(`${renderToolLabel(theme, "ls")} ${linkedPath}`, context.width), 0, 0);
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
      const total = ptcValue?.totalEntries ?? output.split("\n").filter(Boolean).length;
      if (total === 0) return new Text(summaryLine("no entries"), 0, 0);
      let text = summaryLine(`${total} ${total === 1 ? "entry" : "entries"} returned`, { hidden: !!output && !expanded });
      if (expanded && output) text += `\n${output}`;
      return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
    },
  };

  pi.registerTool(tool);
  return tool;
}

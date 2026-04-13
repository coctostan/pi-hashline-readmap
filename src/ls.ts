import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { readdir, stat } from "node:fs/promises";
import { resolveToCwd } from "./path-utils.js";

const MAX_BYTES = 50 * 1024; // 50 KB
const DEFAULT_LIMIT = 500;

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

export function registerLsTool(pi: ExtensionAPI) {
  const tool = {
    name: "ls",
    label: "ls",
    description: "List directory contents. Shows directories first (with `/` suffix), then files, sorted alphabetically. Returns structured metadata for programmatic use.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Directory to list (default: cwd)" })),
      limit: Type.Optional(Type.Number({ description: "Max entries to return (default: 500)" })),
      glob: Type.Optional(Type.String({ description: "Filter entries by glob pattern (e.g. '*.ts')" })),
    }),

    async execute(
      _toolCallId: string,
      params: { path?: string; limit?: number; glob?: string },
      _signal: AbortSignal | undefined,
      _onUpdate: any,
      ctx: any,
    ) {
      const cwd: string = ctx?.cwd ?? process.cwd();
      const targetPath = params.path ? resolveToCwd(params.path, cwd) : cwd;
      const limit = params.limit ?? DEFAULT_LIMIT;

      // Check if path exists and is a directory
      let pathStat;
      try {
        pathStat = await stat(targetPath);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Error: path '${params.path ?? targetPath}' does not exist` }],
          isError: true,
          details: {},
        };
      }

      if (!pathStat.isDirectory()) {
        return {
          content: [{ type: "text" as const, text: `Error: '${params.path ?? targetPath}' is a file, not a directory. Use read to inspect files.` }],
          isError: true,
          details: {},
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

    renderCall(args: any, theme: any) {
      const { path } = args as { path?: string };
      const label = theme.fg("toolTitle", "📁 ls");
      const target = path ?? ".";
      return new Text(`${label} ${theme.fg("muted", target)}`, 0, 0);
    },

    renderResult(result: any, _options: any, theme: any) {
      const output =
        result.content[0]?.type === "text"
          ? (result.content[0] as { type: "text"; text: string }).text
          : "";
      return new Text(theme.fg("toolOutput", output), 0, 0);
    },
  };

  pi.registerTool(tool as any);
  return tool;
}

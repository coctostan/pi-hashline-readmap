import type { ExtensionAPI, ToolRenderResultOptions } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as cp from "node:child_process";
import path from "node:path";
import { readFile as fsReadFile, stat as fsStat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { normalizeToLF, stripBom } from "./edit-diff.js";
import { ensureHashInit } from "./hashline.js";
import { buildPtcLine } from "./ptc-value.js";
import { resolveToCwd } from "./path-utils.js";
import { buildSgOutput } from "./sg-output.js";

type SgParams = { pattern: string; lang?: string; path?: string };

type SgMatch = {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
};

export interface SgRange {
  startLine: number;
  endLine: number;
}

export function mergeRanges(ranges: SgRange[]): SgRange[] {
  if (ranges.length === 0) return [];
  if (ranges.length === 1) return [{ ...ranges[0] }];

  const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine);
  const merged: SgRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    // Merge if overlapping or gap ≤ 1 line
    if (current.startLine <= last.endLine + 2) {
      last.endLine = Math.max(last.endLine, current.endLine);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

const SG_DESC = readFileSync(new URL("../prompts/sg.md", import.meta.url), "utf-8").trim();

function execFileText(
  cmd: string,
  args: string[],
  opts: cp.ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    cp.execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        if ((err as any)?.code === 1) {
          resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
          return;
        }
        (err as any).stdout = stdout;
        (err as any).stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });
}

export function registerSgTool(pi: ExtensionAPI) {
  const ptc = {
    callable: true,
    enabled: true,
    policy: "read-only" as const,
    readOnly: true,
    pythonName: "sg",
    defaultExposure: "opt-in" as const,
  };

  const tool = {
    name: "sg",
    label: "AST Grep",
    description: SG_DESC,
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to search for" }),
      lang: Type.Optional(Type.String({ description: "Language hint for ast-grep (e.g. 'typescript')" })),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
    }),
    ptc,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureHashInit();
      const p = params as SgParams;
      const args = ["run", "--json", "-p", p.pattern];
      if (p.lang) args.push("-l", p.lang);

      const searchPath = resolveToCwd(p.path ?? ".", ctx.cwd);
      args.push(searchPath);

      try {
        const { stdout } = await execFileText("sg", args, {
          cwd: ctx.cwd,
          signal,
          maxBuffer: 10 * 1024 * 1024,
        });

        const matches = JSON.parse(stdout);
        if (!Array.isArray(matches) || matches.length === 0) {
          const emptyOutput = buildSgOutput({ pattern: p.pattern, files: [] });
          return {
            content: [{ type: "text", text: emptyOutput.text }],
            details: {
              ptcValue: emptyOutput.ptcValue,
            },
          };
        }

        const searchPathIsDirectory = await fsStat(searchPath).then((s) => s.isDirectory()).catch(() => false);

        const fileCache = new Map<string, string[]>();
        const getFileLines = async (absolutePath: string): Promise<string[] | undefined> => {
          if (fileCache.has(absolutePath)) return fileCache.get(absolutePath);
          try {
            const raw = (await fsReadFile(absolutePath)).toString("utf-8");
            const lines = normalizeToLF(stripBom(raw).text).split("\n");
            fileCache.set(absolutePath, lines);
            return lines;
          } catch {
            fileCache.set(absolutePath, []);
            return undefined;
          }
        };

        const toAbsoluteFile = (m: SgMatch): string => {
          if (path.isAbsolute(m.file)) return m.file;
          if (searchPathIsDirectory) return path.resolve(searchPath, m.file);
          return searchPath;
        };

        const grouped = new Map<string, { abs: string; matches: SgMatch[] }>();
        for (const m of matches as SgMatch[]) {
          const abs = toAbsoluteFile(m);
          const display = path.relative(ctx.cwd, abs);
          const bucket = grouped.get(display);
          if (bucket) bucket.matches.push(m);
          else grouped.set(display, { abs, matches: [m] });
        }
        const blocks: string[] = [];
        const ptcFiles: Array<{
          displayPath: string;
          path: string;
          ranges: SgRange[];
          lines: ReturnType<typeof buildPtcLine>[];
        }> = [];
        for (const [display, { abs, matches: fileMatches }] of grouped) {
          const lines = await getFileLines(abs);
          if (!lines) continue;
          blocks.push(`--- ${display} ---`);
          const ranges: SgRange[] = fileMatches.map((m) => ({
            startLine: m.range.start.line + 1,
            endLine: m.range.end.line + 1,
          }));
          const mergedRanges = mergeRanges(ranges);
          const ptcFile = {
            displayPath: display,
            path: abs,
            ranges: mergedRanges.map((range) => ({ ...range })),
            lines: [] as ReturnType<typeof buildPtcLine>[],
          };
          for (const range of mergedRanges) {
            for (let ln = range.startLine; ln <= range.endLine; ln++) {
              const srcLine = lines[ln - 1] ?? "";
              const built = buildPtcLine(ln, srcLine);
              blocks.push(`>>${built.line}:${built.hash}|${built.display}`);
              ptcFile.lines.push(built);
            }
          }
          ptcFiles.push(ptcFile);
        }

        if (blocks.length === 0) {
          const emptyOutput = buildSgOutput({ pattern: p.pattern, files: [] });
          return {
            content: [{ type: "text", text: emptyOutput.text }],
            details: {
              ptcValue: emptyOutput.ptcValue,
            },
          };
        }

        const builtOutput = buildSgOutput({
          pattern: p.pattern,
          files: ptcFiles,
        });
        return {
          content: [{ type: "text", text: builtOutput.text }],
          details: {
            ptcValue: builtOutput.ptcValue,
          },
        };
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          return {
            content: [{ type: "text", text: "ast-grep (sg) is not installed. Run: brew install ast-grep" }],
            isError: true,
            details: {},
          };
        }
        return {
          content: [{ type: "text", text: String(err?.stderr || err?.message || err) }],
          isError: true,
          details: {},
        };
      }
    },
    renderCall(args: any, theme: any, ...rest: any[]) {
      const _context = rest[0];
      let text = theme.fg("toolTitle", theme.bold("sg "));
      text += theme.fg("accent", args.pattern);
      if (args.lang) {
        text += theme.fg("dim", ` (${args.lang})`);
      }
      if (args.path && args.path !== ".") {
        text += theme.fg("dim", ` ${args.path}`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
      const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string } =
        rest[0] ?? options ?? {};
      // In older pi versions, options has expanded/isPartial directly.
      // In newer pi versions, context (4th arg) has expanded/isPartial/isError.
      const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
      const isError = context.isError ?? false;
      const expanded = context.expanded ?? (options as any)?.expanded ?? false;
      const cwd = context.cwd ?? process.cwd();

      if (isPartial) return new Text(theme.fg("warning", "Searching\u2026"), 0, 0);

      const content = result.content?.[0];
      const textContent = content?.type === "text" ? content.text : "";
      if (isError || result.isError) {
        const firstLine = textContent.split("\n")[0] || "Error";
        return new Text(theme.fg("error", firstLine), 0, 0);
      }
      const ptcValue = (result.details as any)?.ptcValue as
        | { tool: "sg"; files: Array<{ path: string; lines: any[] }> }
        | undefined;
      const files = ptcValue?.files ?? [];
      if (files.length === 0) {
        return new Text(theme.fg("muted", "No matches"), 0, 0);
      }
      const fileCount = files.length;
      const totalMatches = files.reduce((sum: number, f: any) => sum + f.lines.length, 0);
      const matchWord = totalMatches === 1 ? "match" : "matches";
      const fileWord = fileCount === 1 ? "file" : "files";
      let text = theme.fg("success", `\u2713 ${totalMatches} ${matchWord} in ${fileCount} ${fileWord}`);

      if (expanded) {
        const showFiles = files.slice(0, 20);
        for (const file of showFiles) {
          const display = path.relative(cwd, file.path) || file.path;
          text += "\n" + theme.fg("dim", `  ${display} (${file.lines.length})`);
        }
        if (files.length > 20) {
          text += "\n" + theme.fg("muted", `  \u2026 and ${files.length - 20} more files`);
        }
      }

      return new Text(text, 0, 0);
    },
  } satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

  pi.registerTool(tool);
  return tool;
}

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as cp from "node:child_process";
import path from "node:path";
import { readFile as fsReadFile, stat as fsStat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { normalizeToLF, stripBom } from "./edit-diff.js";
import { computeLineHash, ensureHashInit } from "./hashline.js";
import { resolveToCwd } from "./path-utils.js";

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

export function registerSgTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "sg",
    label: "AST Grep",
    description: SG_DESC,
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to search for" }),
      lang: Type.Optional(Type.String({ description: "Language hint for ast-grep (e.g. 'typescript')" })),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
    }),

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
          return {
            content: [{ type: "text", text: `No matches found for pattern: ${p.pattern}` }],
            details: {},
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
        for (const [display, { abs, matches: fileMatches }] of grouped) {
          const lines = await getFileLines(abs);
          if (!lines) continue;
          blocks.push(`--- ${display} ---`);
          const ranges: SgRange[] = fileMatches.map((m) => ({
            startLine: m.range.start.line + 1,
            endLine: m.range.end.line + 1,
          }));
          const mergedRanges = mergeRanges(ranges);
          for (const range of mergedRanges) {
            for (let ln = range.startLine; ln <= range.endLine; ln++) {
              const srcLine = lines[ln - 1] ?? "";
              blocks.push(`>>${ln}:${computeLineHash(ln, srcLine)}|${srcLine}`);
            }
          }
        }

        if (blocks.length === 0) {
          return {
            content: [{ type: "text", text: `No matches found for pattern: ${p.pattern}` }],
            details: {},
          };
        }

        return { content: [{ type: "text", text: blocks.join("\n") }], details: {} };
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
  });
}

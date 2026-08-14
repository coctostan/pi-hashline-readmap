import type { ExtensionAPI, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import * as cp from "node:child_process";
import path from "node:path";
import { readFile as fsReadFile, stat as fsStat } from "node:fs/promises";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { normalizeToLF, stripBom } from "./edit-diff.js";
import { ensureHashInit } from "./hashline.js";
import { buildPtcError, buildPtcLine } from "./ptc-value.js";
import { resolveToCwd } from "./path-utils.js";
import type { FileSymbol } from "./readmap/types.js";
import { buildSgOutput, type SgOutputBudget } from "./sg-output.js";
import { buildAstSearchRehydrateDescriptor, isContextHygieneDebugEnabled } from "./context-hygiene.js";
import { clampLineToWidth, clampLinesToWidth, isRendererExpanded, renderToolLabel, summaryLine } from "./tui-render-utils.js";
import { executableCommand, resolveBundledBin } from "./binary-resolution.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";

type SgParams = { pattern: string; lang?: string; path?: string; limit?: number | string };
type NormalizedSgParams = Omit<SgParams, "limit"> & { limit?: number };
export const AST_SEARCH_DEFAULT_LIMIT = 100;
const CONTEXT_HYGIENE_SG_SYMBOL_FILE_CAP = 20;

type SgMatch = {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
};

export interface SgRange {
  startLine: number;
  endLine: number;
}

export interface SgEnclosingSymbol {
  name: string;
  kind: string;
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

function collectFileSymbols(symbols: FileSymbol[]): FileSymbol[] {
  return symbols.flatMap((symbol) => [symbol, ...collectFileSymbols(symbol.children ?? [])]);
}

export async function findEnclosingSgSymbols(absPath: string, ranges: SgRange[]): Promise<SgEnclosingSymbol[]> {
  let fileMap: Awaited<ReturnType<typeof import("./map-cache.js").getOrGenerateMap>>;
  try {
    const { getOrGenerateMap } = await import("./map-cache.js");
    fileMap = await getOrGenerateMap(absPath);
  } catch {
    return [];
  }
  if (!fileMap) return [];

  const allSymbols = collectFileSymbols(fileMap.symbols);
  const found: SgEnclosingSymbol[] = [];
  const seenKeys = new Set<string>();

  for (const range of ranges) {
    const enclosing = allSymbols
      .filter((symbol) => symbol.startLine <= range.startLine && symbol.endLine >= range.endLine)
      .sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine) || a.startLine - b.startLine)[0];
    if (!enclosing) continue;

    const key = `${enclosing.kind}:${enclosing.name}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    found.push({ name: enclosing.name, kind: enclosing.kind });
  }

  return found;
}

const SG_PROMPT_METADATA = defineToolPromptMetadata({
  promptUrl: new URL("../prompts/sg.md", import.meta.url),
  promptSnippet: "Search code structurally with ast-grep and return edit-ready anchors",
  promptGuidelines: [
    "Use ast_search when text search is too broad or brittle and the query depends on code shape.",
    "Use ast_search for calls, imports, declarations, JSX, and similar syntax patterns.",
    "Use grep instead of ast_search for plain text search.",
  ],
});

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

/**
 * Check if the `sg` (ast-grep) binary is available in PATH.
 * Runs `sg --version` synchronously with a 3-second timeout.
 */
export function resolveSgBinary(): string {
  // PATH fallback name. We intentionally prefer `ast-grep` over `sg` because on
  // Linux `sg` collides with util-linux's setgid helper (see GH #112). The
  // bundled `@ast-grep/cli` package still resolves by its `sg` bin entry above;
  // only the PATH fallback string changes.
  return resolveBundledBin("@ast-grep/cli", "sg", "ast-grep");
}

export function isSgAvailable(): boolean {
  try {
    const binary = executableCommand(resolveSgBinary());
    cp.execFileSync(binary.command, [...binary.argsPrefix, "--version"], { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface SgToolOptions {
  onFileAnchored?: (absolutePath: string) => void;
  outputBudget?: SgOutputBudget;
}

export function registerSgTool(pi: ExtensionAPI, options: SgToolOptions = {}) {
  const ptc = {
    callable: true,
    enabled: true,
    policy: "read-only" as const,
    readOnly: true,
    pythonName: "ast_search",
    defaultExposure: "opt-in" as const,
  };

  const tool = {
    name: "ast_search",
    label: "AST Search",
    description: SG_PROMPT_METADATA.description,
    promptSnippet: SG_PROMPT_METADATA.promptSnippet,
    promptGuidelines: SG_PROMPT_METADATA.promptGuidelines,
    parameters: Type.Object({
      pattern: Type.String({ description: "ast-grep structural pattern" }),
      lang: Type.Optional(Type.String({ description: "Language hint" })),
      path: Type.Optional(Type.String({ description: "Search path" })),
      limit: Type.Optional(Type.Union([
        Type.Number({ description: "Positive int or obvious base-10 numeric string" }),
        Type.String({ description: "Positive int or obvious base-10 numeric string" }),
      ])),
    }),
    ptc,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      await ensureHashInit();
      const rawParams = params as SgParams;
      const limit = coerceObviousBase10Int(rawParams.limit, "limit");
      if (!limit.ok) {
        return {
          content: [{ type: "text", text: limit.message }],
          isError: true,
          details: { ptcValue: { tool: "ast_search", ok: false, error: buildPtcError("invalid-limit", limit.message) } },
        };
      }
      if (limit.value !== undefined && limit.value < 1) {
        const message = `Invalid limit: expected a positive integer, received ${limit.value}.`;
        return {
          content: [{ type: "text", text: message }],
          isError: true,
          details: { ptcValue: { tool: "ast_search", ok: false, error: buildPtcError("invalid-limit", message) } },
        };
      }
      const p: NormalizedSgParams = { ...rawParams, limit: limit.value };
      const effectiveLimit = typeof p.limit === "number" ? p.limit : AST_SEARCH_DEFAULT_LIMIT;
      const rehydrate = buildAstSearchRehydrateDescriptor({
        pattern: p.pattern,
        lang: p.lang,
        path: p.path,
        limit: typeof p.limit === "number" ? p.limit : undefined,
      });
      const args = ["run", "--json", "-p", p.pattern];

      const searchPath = resolveToCwd(p.path ?? ".", ctx.cwd);

      try {
        await fsStat(searchPath);
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          const message = `Error: path '${p.path ?? "."}' does not exist`;
          return {
            content: [{ type: "text", text: message }],
            isError: true,
            details: {
              ptcValue: {
                tool: "ast_search",
                ok: false,
                path: p.path ?? searchPath,
                error: buildPtcError("path-not-found", message),
              },
            },
          };
        }
        if (err?.code === "EACCES" || err?.code === "EPERM") {
          const message = `Error: permission denied for path '${p.path ?? "."}'`;
          return {
            content: [{ type: "text", text: message }],
            isError: true,
            details: {
              ptcValue: {
                tool: "ast_search",
                ok: false,
                path: p.path ?? searchPath,
                error: buildPtcError("permission-denied", message),
              },
            },
          };
        }
        const message = `Error: could not access path '${p.path ?? "."}': ${err?.message ?? String(err)}`;
        return {
          content: [{ type: "text", text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "ast_search",
              ok: false,
              path: p.path ?? searchPath,
              error: buildPtcError("fs-error", message, undefined, { fsCode: err?.code, fsMessage: err?.message }),
            },
          },
        };
      }

      // Auto-promote `lang: "typescript"` → "tsx" when the user pointed at a
      // single `.tsx` file. ast-grep's TS grammar cannot parse JSX, so this
      // closes the silent-miss reported in issue #173. Per-file scope only:
      // directory paths and other extensions are left untouched so existing
      // behavior is preserved for mixed-extension trees.
      let effectiveLang = p.lang;
      if (p.lang === "typescript") {
        try {
          const st = await fsStat(searchPath);
          if (st.isFile() && path.extname(searchPath).toLowerCase() === ".tsx") {
            effectiveLang = "tsx";
          }
        } catch {
          // Already handled by the prior fsStat block; fall through.
        }
      }
      if (effectiveLang) args.push("-l", effectiveLang);
      args.push(searchPath);

      try {
        const binary = executableCommand(resolveSgBinary());
        const { stdout } = await execFileText(binary.command, [...binary.argsPrefix, ...args], {
          cwd: ctx.cwd,
          signal,
          maxBuffer: 10 * 1024 * 1024,
        });

        const matches = JSON.parse(stdout);
        if (!Array.isArray(matches) || matches.length === 0) {
          const emptyOutput = buildSgOutput({ pattern: p.pattern, files: [], rehydrate });
          return {
            content: [{ type: "text", text: emptyOutput.text }],
            details: {
              ptcValue: emptyOutput.ptcValue,
              contextHygiene: emptyOutput.contextHygiene,
            },
          };
        }

        const allMatches = matches as SgMatch[];
        const selectedMatches = allMatches.slice(0, effectiveLimit);
        const omittedMatches = allMatches.length - selectedMatches.length;
        const matchLimit = omittedMatches > 0
          ? {
              limit: effectiveLimit,
              totalMatches: allMatches.length,
              returnedMatches: selectedMatches.length,
              omittedMatches,
            }
          : undefined;

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
        for (const m of selectedMatches) {
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
          symbols?: SgEnclosingSymbol[];
        }> = [];
        const enrichContextHygieneSymbols = isContextHygieneDebugEnabled() && grouped.size <= CONTEXT_HYGIENE_SG_SYMBOL_FILE_CAP;
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
            symbols: [] as SgEnclosingSymbol[],
          };
          for (const range of mergedRanges) {
            for (let ln = range.startLine; ln <= range.endLine; ln++) {
              const srcLine = lines[ln - 1] ?? "";
              const built = buildPtcLine(ln, srcLine);
              blocks.push(`>>${built.line}:${built.hash}|${built.display}`);
              ptcFile.lines.push(built);
            }
          }
          ptcFile.symbols = enrichContextHygieneSymbols ? await findEnclosingSgSymbols(abs, ranges) : [];
          ptcFiles.push(ptcFile);
        }

        if (blocks.length === 0) {
          const emptyOutput = buildSgOutput({ pattern: p.pattern, files: [], rehydrate });
          return {
            content: [{ type: "text", text: emptyOutput.text }],
            details: {
              ptcValue: emptyOutput.ptcValue,
              contextHygiene: emptyOutput.contextHygiene,
            },
          };
        }

        const builtOutput = buildSgOutput({
          pattern: p.pattern,
          files: ptcFiles,
          matchLimit,
          budget: options.outputBudget,
          rehydrate,
        });
        for (const ptcFile of ptcFiles) {
          if (ptcFile.lines.length > 0) {
            options.onFileAnchored?.(ptcFile.path);
          }
        }
        return {
          content: [{ type: "text", text: builtOutput.text }],
          details: { ptcValue: builtOutput.ptcValue, contextHygiene: builtOutput.contextHygiene },
        };
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          const message = "ast-grep (sg) could not be resolved or executed. pi-hashline-readmap includes @ast-grep/cli for normal npm installs; run npm install, or install ast-grep on PATH as a fallback (for example: brew install ast-grep).";
          return {
            content: [{ type: "text", text: message }],
            isError: true,
            details: {
              ptcValue: {
                tool: "ast_search",
                ok: false,
                error: buildPtcError(
                  "sg-not-installed",
                  message,
                  "Run npm install to install @ast-grep/cli, or install ast-grep on PATH as a fallback: brew install ast-grep.",
                ),
              },
            },
          };
        }
        const message = String(err?.stderr || err?.message || err);
        return {
          content: [{ type: "text", text: message }],
          isError: true,
          details: {
            ptcValue: {
              tool: "ast_search",
              ok: false,
              error: buildPtcError("sg-execution-error", message),
            },
          },
        };
      }
    },
    renderCall(args: any, theme: any, ...rest: any[]) {
      const context = rest[0] ?? {};
      let text = `${renderToolLabel(theme, "ast_search")} ${theme.fg("accent", `/${args.pattern}/`)}`;
      text += theme.fg("dim", ` in ${args.path ?? "."}`);
      if (args.lang) text += theme.fg("dim", ` (${args.lang})`);
      return new Text(clampLineToWidth(text, context.width), 0, 0);
    },
    renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
      const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string; width?: number } =
        rest[0] ?? options ?? {};
      // In older pi versions, options has expanded/isPartial directly.
      // In newer pi versions, context (4th arg) has expanded/isPartial/isError.
      const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
      const isError = context.isError ?? false;
      const expanded = isRendererExpanded(options as any, context as any);
      const cwd = context.cwd ?? process.cwd();
      const width = (context as any).width ?? (options as any)?.width;

      if (isPartial) return new Text(clampLinesToWidth([summaryLine("pending search")], width).join("\n"), 0, 0);

      const content = result.content?.[0];
      const textContent = content?.type === "text" ? content.text : "";
      if (isError || result.isError) {
        const firstLine = textContent.split("\n")[0] || "Error";
        const body = expanded && textContent ? textContent : firstLine;
        return new Text(clampLinesToWidth(summaryLine(body).split("\n"), width).join("\n"), 0, 0);
      }
      const ptcValue = (result.details as any)?.ptcValue as
        | {
            tool: "ast_search";
            files: Array<{ path: string; lines: any[] }>;
            truncation?: {
              matchLimit?: { omittedMatches: number };
              outputBudget?: { totalBlocks: number; shownBlocks: number };
            };
          }
        | undefined;
      const files = ptcValue?.files ?? [];
      if (files.length === 0) return new Text(summaryLine("no matches"), 0, 0);
      const fileCount = files.length;
      const returnedLines = files.reduce((sum: number, file: any) => sum + file.lines.length, 0);
      const lineWord = returnedLines === 1 ? "anchored line" : "anchored lines";
      const fileWord = fileCount === 1 ? "file" : "files";
      const truncationParts: string[] = [];
      const omittedMatches = ptcValue?.truncation?.matchLimit?.omittedMatches ?? 0;
      if (omittedMatches > 0) truncationParts.push(`${omittedMatches} AST matches omitted`);
      if (ptcValue?.truncation?.outputBudget) {
        const output = ptcValue.truncation.outputBudget;
        truncationParts.push(`${output.shownBlocks}/${output.totalBlocks} blocks shown`);
      }
      const truncationLabel = truncationParts.length > 0
        ? ` [truncated: ${truncationParts.join("; ")}]`
        : "";
      let text = summaryLine(
        `${returnedLines} ${lineWord} in ${fileCount} ${fileWord}${truncationLabel}`,
        { hidden: files.length > 0 && !expanded },
      );
      if (expanded) {
        for (const file of files.slice(0, 20)) {
          const display = path.relative(cwd, file.path) || file.path;
          text += "\n" + theme.fg("dim", `  ${display} (${file.lines.length})`);
        }
        if (files.length > 20) text += "\n" + theme.fg("muted", `  … and ${files.length - 20} more files`);
      }
      return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
    },
  } satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

  pi.registerTool(tool);
  return tool;
}

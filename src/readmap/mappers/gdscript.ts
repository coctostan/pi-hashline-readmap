import { execFile, type ExecFileOptions } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FileMap, FileSymbol } from "../types.js";
import { DetailLevel, SymbolKind } from "../enums.js";
import { reportParserError } from "../parser-errors.js";

export const MAPPER_VERSION = 1;

type ExecFileResult = { stdout: string; stderr: string };

function execFileAsync(
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "../../../scripts/gdscript_outline.py");

interface GdscriptHelperSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature?: string;
  children?: GdscriptHelperSymbol[];
}

interface GdscriptHelperResult {
  imports?: string[];
  symbols?: GdscriptHelperSymbol[];
  error?: string;
}

function mapKind(kind: string): SymbolKind {
  switch (kind) {
    case "class": return SymbolKind.Class;
    case "function": return SymbolKind.Function;
    case "method": return SymbolKind.Method;
    case "variable": return SymbolKind.Variable;
    case "property": return SymbolKind.Property;
    case "constant": return SymbolKind.Constant;
    case "enum": return SymbolKind.Enum;
    case "signal": return SymbolKind.Signal;
    default: return SymbolKind.Unknown;
  }
}

function convertSymbol(input: GdscriptHelperSymbol): FileSymbol {
  const symbol: FileSymbol = {
    name: input.name,
    kind: mapKind(input.kind),
    startLine: input.startLine,
    endLine: input.endLine,
  };
  if (input.signature) symbol.signature = input.signature;
  if (input.children?.length) symbol.children = input.children.map(convertSymbol);
  return symbol;
}

function countLines(text: string): number {
  return text.length === 0 ? 0 : text.split("\n").length;
}

function reportGdscriptBackendUnavailable(): void {
  console.error("GDScript support requires pip install gdtoolkit or disabling PI_HASHLINE_GDSCRIPT");
}

export async function gdscriptMapper(filePath: string, signal?: AbortSignal): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const content = await readFile(filePath, "utf8");
    if (signal?.aborted) return null;

    const { stdout } = await execFileAsync("python3", [SCRIPT_PATH, filePath], {
      signal,
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as GdscriptHelperResult;
    if (parsed.error) {
      if (parsed.error.includes("gdtoolkit")) reportGdscriptBackendUnavailable();
      else reportParserError("gdscript-helper-error", new Error(parsed.error), { context: "GDScript mapper failed" });
      return null;
    }

    return {
      path: filePath,
      totalLines: countLines(content),
      totalBytes: stats.size,
      language: "GDScript",
      imports: parsed.imports ?? [],
      symbols: (parsed.symbols ?? []).map(convertSymbol),
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) return null;
    reportParserError("gdscript-mapper-failed", error, { context: "GDScript mapper failed" });
    return null;
  }
}

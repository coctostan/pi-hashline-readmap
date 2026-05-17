import { exec } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";
export const MAPPER_VERSION = 1;

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "gdscript_outline.py");

interface GdSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature?: string;
  children?: GdSymbol[];
}

interface GdOutlineResult {
  imports?: string[];
  symbols: GdSymbol[];
  error?: string;
}

function mapKind(kind: string): SymbolKind {
  switch (kind) {
    case "class": {
      return SymbolKind.Class;
    }
    case "function": {
      return SymbolKind.Function;
    }
    case "constant": {
      return SymbolKind.Constant;
    }
    case "variable": {
      return SymbolKind.Variable;
    }
    case "signal": {
      return SymbolKind.Signal;
    }
    case "enum": {
      return SymbolKind.Enum;
    }
    default: {
      return SymbolKind.Unknown;
    }
  }
}

function convertSymbol(gs: GdSymbol): FileSymbol {
  const symbol: FileSymbol = {
    name: gs.name,
    kind: mapKind(gs.kind),
    startLine: gs.startLine,
    endLine: gs.endLine,
  };

  if (gs.signature) {
    symbol.signature = gs.signature;
  }

  if (gs.children && gs.children.length > 0) {
    symbol.children = gs.children.map(convertSymbol);
  }

  return symbol;
}

/**
 * Generate a file map for a GDScript file using gdtoolkit (Lark-based parser).
 */
export async function gdscriptMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    const { stdout: wcOutput } = await execAsync(`wc -l < "${filePath}"`, {
      signal,
    });
    const totalLines = Number.parseInt(wcOutput.trim(), 10) || 0;

    const { stdout, stderr } = await execAsync(
      `python3 "${SCRIPT_PATH}" "${filePath}"`,
      {
        signal,
        timeout: 10_000,
        maxBuffer: 5 * 1024 * 1024,
      }
    );

    if (stderr && !stdout) {
      console.error(`GDScript mapper stderr: ${stderr}`);
      return null;
    }

    const result: GdOutlineResult = JSON.parse(stdout);

    if (result.error) {
      console.error(`GDScript mapper error: ${result.error}`);
      return null;
    }

    const fileMap: FileMap = {
      path: filePath,
      totalLines,
      totalBytes,
      language: "GDScript",
      symbols: result.symbols.map(convertSymbol),
      imports: result.imports ?? [],
      detailLevel: DetailLevel.Full,
    };

    return fileMap;
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`GDScript mapper failed: ${error}`);
    return null;
  }
}

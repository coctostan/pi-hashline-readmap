import { exec } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "../../scripts/python_outline.py");

interface PythonSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature?: string;
  modifiers?: string[];
  children?: PythonSymbol[];
  docstring?: string;
  is_exported?: boolean;
}

interface PythonOutlineResult {
  imports?: string[];
  symbols: PythonSymbol[];
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
    case "method": {
      return SymbolKind.Method;
    }
    case "constant": {
      return SymbolKind.Constant;
    }
    case "variable": {
      return SymbolKind.Variable;
    }
    default: {
      return SymbolKind.Unknown;
    }
  }
}

function convertSymbol(ps: PythonSymbol): FileSymbol {
  const symbol: FileSymbol = {
    name: ps.name,
    kind: mapKind(ps.kind),
    startLine: ps.startLine,
    endLine: ps.endLine,
  };

  if (ps.signature) {
    symbol.signature = ps.signature;
  }

  if (ps.modifiers && ps.modifiers.length > 0) {
    symbol.modifiers = ps.modifiers;
  }

  if (ps.children && ps.children.length > 0) {
    symbol.children = ps.children.map(convertSymbol);
  }

  if (ps.docstring) {
    symbol.docstring = ps.docstring;
  }

  if (ps.is_exported !== undefined) {
    symbol.isExported = ps.is_exported;
  }

  return symbol;
}

/**
 * Generate a file map for a Python file using AST parsing.
 */
export async function pythonMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    // Get file stats
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Count lines
    const { stdout: wcOutput } = await execAsync(`wc -l < "${filePath}"`, {
      signal,
    });
    const totalLines = Number.parseInt(wcOutput.trim(), 10) || 0;

    // Run Python script
    const { stdout, stderr } = await execAsync(
      `python3 "${SCRIPT_PATH}" "${filePath}"`,
      {
        signal,
        timeout: 10_000,
        maxBuffer: 5 * 1024 * 1024, // 5MB
      }
    );

    if (stderr && !stdout) {
      console.error(`Python mapper stderr: ${stderr}`);
      return null;
    }

    const result: PythonOutlineResult = JSON.parse(stdout);

    if (result.error) {
      console.error(`Python mapper error: ${result.error}`);
      return null;
    }

    const fileMap: FileMap = {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Python",
      symbols: result.symbols.map(convertSymbol),
      imports: result.imports ?? [],
      detailLevel: DetailLevel.Full,
    };

    return fileMap;
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`Python mapper failed: ${error}`);
    return null;
  }
}

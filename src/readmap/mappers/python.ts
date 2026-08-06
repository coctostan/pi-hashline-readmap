// NOTE: This mapper invokes a Python helper script as a subprocess. Use
// `execFile` (no shell) with an args array — never `exec` with template
// interpolation — so paths containing shell metacharacters are passed safely as
// argv entries instead of being parsed by `/bin/sh`. See GH #116.
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";
export const MAPPER_VERSION = 1;

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = join(__dirname, "../../../scripts/python_outline.py");

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

    // Count lines in JS — matches `wc -l` semantics for newline-terminated and
    // unterminated tails.
    const fileText = await readFile(filePath, "utf8");
    const totalLines = fileText.split("\n").length - 1;

    // Run Python script via execFile (no shell).
    const { stdout, stderr } = await execFileAsync("python3", [SCRIPT_PATH, filePath], {
      signal,
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      console.error(`Python mapper stderr: ${stderr}`);
      return null;
    }

    const result: PythonOutlineResult = JSON.parse(stdout);

    if (result.error) {
      console.error(`Python mapper error: ${result.error}`);
      return null;
    }

    const symbols = result.symbols.map(convertSymbol);
    // Contract: no extracted symbols means "miss" so ctags/regex fallback can run.
    // MAPPER_VERSION stays 1 — non-empty Python output is unchanged, and stale
    // empty cache entries are rejected semantically in src/map-cache.ts
    // (isUsefulMap, Tasks 2-3) rather than by cache-key invalidation.
    if (symbols.length === 0) {
      return null;
    }

    const fileMap: FileMap = {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Python",
      symbols,
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

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, "../../scripts");
const GO_SOURCE = join(SCRIPTS_DIR, "go_outline.go");
const GO_BINARY = join(SCRIPTS_DIR, "go_outline");

interface GoSymbol {
  name: string;
  kind: string;
  startLine: number;
  endLine: number;
  signature?: string;
  modifiers?: string[];
  children?: GoSymbol[];
  docstring?: string;
  isExported?: boolean;
}

interface GoOutlineResult {
  package: string;
  imports?: string[];
  symbols: GoSymbol[];
  error?: string;
}

// Track if we've already tried to compile
let compileAttempted = false;
let binaryAvailable = false;

/**
 * Check if Go is available.
 */
async function hasGo(): Promise<boolean> {
  try {
    await execAsync("go version", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the Go binary is compiled.
 * Returns true if the binary is ready to use.
 */
async function ensureBinary(): Promise<boolean> {
  // Check if binary already exists
  if (existsSync(GO_BINARY)) {
    binaryAvailable = true;
    return true;
  }

  // Only try to compile once per session
  if (compileAttempted) {
    return binaryAvailable;
  }
  compileAttempted = true;

  // Check if Go is available
  if (!(await hasGo())) {
    console.error("Go mapper: go not available for compilation");
    return false;
  }

  // Check if source exists
  if (!existsSync(GO_SOURCE)) {
    console.error(`Go mapper: source not found at ${GO_SOURCE}`);
    return false;
  }

  try {
    // Compile the binary
    await execAsync(`go build -o "${GO_BINARY}" "${GO_SOURCE}"`, {
      timeout: 30_000,
      cwd: SCRIPTS_DIR,
    });
    binaryAvailable = true;
    return true;
  } catch (error) {
    console.error(`Go mapper: compilation failed: ${error}`);
    return false;
  }
}

/**
 * Map Go kinds to our SymbolKind.
 */
function mapKind(kind: string): SymbolKind {
  switch (kind) {
    case "struct": {
      return SymbolKind.Class;
    }
    case "interface": {
      return SymbolKind.Interface;
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
    case "type": {
      return SymbolKind.Type;
    }
    case "field": {
      return SymbolKind.Variable;
    }
    default: {
      return SymbolKind.Unknown;
    }
  }
}

/**
 * Convert Go symbols to FileSymbols.
 */
function convertSymbol(gs: GoSymbol): FileSymbol {
  const symbol: FileSymbol = {
    name: gs.name,
    kind: mapKind(gs.kind),
    startLine: gs.startLine,
    endLine: gs.endLine,
  };

  if (gs.signature) {
    symbol.signature = gs.signature;
  }

  if (gs.modifiers && gs.modifiers.length > 0) {
    symbol.modifiers = gs.modifiers;
  }

  if (gs.children && gs.children.length > 0) {
    symbol.children = gs.children.map(convertSymbol);
  }

  if (gs.docstring) {
    symbol.docstring = gs.docstring;
  }

  if (gs.isExported !== undefined) {
    symbol.isExported = gs.isExported;
  }

  return symbol;
}

/**
 * Generate a file map for a Go file using go/ast.
 */
export async function goMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    // Ensure binary is available
    if (!(await ensureBinary())) {
      return null;
    }

    // Get file stats
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Count lines
    const { stdout: wcOutput } = await execAsync(`wc -l < "${filePath}"`, {
      signal,
    });
    const totalLines = Number.parseInt(wcOutput.trim(), 10) || 0;

    // Run Go outline script
    const { stdout, stderr } = await execAsync(`"${GO_BINARY}" "${filePath}"`, {
      signal,
      timeout: 10_000,
    });

    if (stderr && !stdout) {
      console.error(`Go mapper stderr: ${stderr}`);
      return null;
    }

    const result: GoOutlineResult = JSON.parse(stdout);

    if (result.error) {
      console.error(`Go mapper error: ${result.error}`);
      return null;
    }

    const fileMap: FileMap = {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Go",
      symbols: result.symbols.map(convertSymbol),
      imports: result.imports ?? [],
      detailLevel: DetailLevel.Full,
    };

    return fileMap;
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`Go mapper failed: ${error}`);
    return null;
  }
}

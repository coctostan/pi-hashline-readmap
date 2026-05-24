import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";
export const MAPPER_VERSION = 2;

const execFileAsync = promisify(execFile);

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
 * Count lines in file content without spawning wc.
 */
function countLines(content: string): number {
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") count++;
  }
  return count;
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

    // Count lines in JS instead of spawning wc
    const content = await readFile(filePath, "utf-8");
    const totalLines = countLines(content);

    // Use execFile to avoid shell injection
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [SCRIPT_PATH, filePath],
      {
        signal,
        timeout: 10_000,
        maxBuffer: 5 * 1024 * 1024,
      }
    );

    // Check for stderr (non-fatal warnings are ok if we got output)
    if (stderr) {
      // Check for missing gdtoolkit
      if (stderr.includes("ModuleNotFoundError") || stderr.includes("gdtoolkit")) {
        console.error(
          "[hashline] GDScript mapper requires gdtoolkit. " +
          "Install it with: pip3 install --system gdtoolkit"
        );
      } else {
        console.error(`GDScript mapper stderr: ${stderr}`);
      }
      if (!stdout) return null;
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
  } catch (error: any) {
    if (signal?.aborted) {
      return null;
    }
    // Check for missing gdtoolkit in exception
    const errorMsg = String(error);
    if (errorMsg.includes("ModuleNotFoundError") || errorMsg.includes("gdtoolkit")) {
      console.error(
        "[hashline] GDScript mapper requires gdtoolkit. " +
        "Install it with: pip3 install --system gdtoolkit"
      );
    } else {
      console.error(`GDScript mapper failed: ${error}`);
    }
    return null;
  }
}

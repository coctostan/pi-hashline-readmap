import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

/**
 * Regex patterns for C language constructs.
 */
const C_PATTERNS = {
  // Function definition: type name(params) { or type name(params);
  function: /^(\w+(?:\s*\*)?)\s+(\w+)\s*\(([^)]*)\)\s*(?:\{|;)?/,

  // Struct definition: struct name { or typedef struct { ... } name;
  struct: /^(?:typedef\s+)?struct\s+(\w+)?\s*\{/,

  // Enum definition
  enum: /^(?:typedef\s+)?enum\s+(\w+)?\s*\{/,

  // Union definition
  union: /^(?:typedef\s+)?union\s+(\w+)?\s*\{/,

  // #define macro
  define: /^#define\s+(\w+)(?:\([^)]*\))?\s*/,

  // Global variable declaration
  variable:
    /^(?:static\s+)?(?:const\s+)?(?:volatile\s+)?(\w+(?:\s*\*)?)\s+(\w+)\s*(?:=|;)/,

  // Typedef
  typedef: /^typedef\s+(?:struct|enum|union)?\s*\w*\s*\{?[^}]*\}?\s*(\w+)\s*;/,
};

interface CMatch {
  name: string;
  kind: SymbolKind;
  startLine: number;
  signature?: string;
  modifiers?: string[];
  isExported?: boolean;
}

/**
 * Find the end of a brace-delimited block.
 */
function findBlockEnd(lines: string[], startIdx: number): number {
  let braceCount = 0;
  let foundOpen = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    for (const char of line) {
      if (char === "{") {
        braceCount++;
        foundOpen = true;
      } else if (char === "}") {
        braceCount--;
        if (foundOpen && braceCount === 0) {
          return i + 1; // 1-indexed
        }
      }
    }
  }

  return startIdx + 1; // Single line if no block found
}

/**
 * Check if a line is inside a function body.
 */
function isInsideFunction(lines: string[], lineIdx: number): boolean {
  let braceCount = 0;
  for (let i = 0; i < lineIdx; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    for (const char of line) {
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
      }
    }
  }
  return braceCount > 0;
}

/**
 * Generate a file map for a C file using regex patterns.
 */
export async function cMapper(
  filePath: string,
  _signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const matches: CMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      const trimmed = line.trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        continue;
      }

      // Skip lines inside function bodies (only want top-level)
      if (isInsideFunction(lines, i) && !C_PATTERNS.define.test(trimmed)) {
        continue;
      }

      // Check for #define
      const defineMatch = C_PATTERNS.define.exec(trimmed);
      if (defineMatch) {
        const [, matchName] = defineMatch;
        if (matchName) {
          matches.push({
            name: matchName,
            kind: SymbolKind.Constant,
            startLine: lineNum,
          });
        }
        continue;
      }

      // Check for struct
      const structMatch = C_PATTERNS.struct.exec(trimmed);
      if (structMatch) {
        matches.push({
          name: structMatch[1] ?? "(anonymous)",
          kind: SymbolKind.Class,
          startLine: lineNum,
        });
        continue;
      }

      // Check for enum
      const enumMatch = C_PATTERNS.enum.exec(trimmed);
      if (enumMatch) {
        matches.push({
          name: enumMatch[1] ?? "(anonymous)",
          kind: SymbolKind.Enum,
          startLine: lineNum,
        });
        continue;
      }

      // Check for union
      const unionMatch = C_PATTERNS.union.exec(trimmed);
      if (unionMatch) {
        matches.push({
          name: unionMatch[1] ?? "(anonymous)",
          kind: SymbolKind.Class,
          startLine: lineNum,
          modifiers: ["union"],
        });
        continue;
      }

      // Check for function
      const funcMatch = C_PATTERNS.function.exec(trimmed);
      if (funcMatch) {
        const [, returnType, name, params] = funcMatch;

        // Skip if it's a variable declaration or control statement
        if (
          !trimmed.includes("(") ||
          !name ||
          /^(if|while|for|switch|return)$/.test(name)
        ) {
          continue;
        }

        matches.push({
          name,
          kind: SymbolKind.Function,
          startLine: lineNum,
          signature: `(${params ?? ""}): ${returnType ?? "void"}`,
          isExported: !trimmed.startsWith("static"),
        });
        continue;
      }
    }

    // Convert to symbols with end lines
    const symbols: FileSymbol[] = matches.map((m) => {
      const { startLine } = m;
      const endLine =
        m.kind === SymbolKind.Constant
          ? startLine
          : findBlockEnd(lines, startLine - 1);

      const symbol: FileSymbol = {
        name: m.name,
        kind: m.kind,
        startLine,
        endLine,
      };

      if (m.signature) {
        symbol.signature = m.signature;
      }

      if (m.modifiers) {
        symbol.modifiers = m.modifiers;
      }

      if (m.isExported !== undefined) {
        symbol.isExported = m.isExported;
      }

      return symbol;
    });

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "C",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    console.error(`C mapper failed: ${error}`);
    return null;
  }
}

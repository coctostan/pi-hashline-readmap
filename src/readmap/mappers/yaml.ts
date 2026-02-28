/**
 * YAML mapper using regex-based key extraction.
 *
 * Extracts top-level keys and nested structures with line numbers.
 */
import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

interface YamlKey {
  name: string;
  indent: number;
  line: number;
  isArrayItem: boolean;
}

/**
 * Extract YAML keys with their indentation levels.
 * Handles both mapping keys and array items.
 */
function extractYamlKeys(content: string): YamlKey[] {
  const lines = content.split(/\r?\n/);
  const keys: YamlKey[] = [];

  // Skip document separators, comments, empty lines
  const skipLine = /^(---|\.\.\.|\s*#|\s*$)/;

  for (const [i, line] of lines.entries()) {
    if (skipLine.test(line)) {
      continue;
    }

    const lineNum = i + 1;

    // Match key: value or key: (without value)
    const keyMatch = line.match(/^(\s*)([a-zA-Z_][\w.-]*)\s*:/);
    if (keyMatch && keyMatch[1] !== undefined && keyMatch[2]) {
      keys.push({
        name: keyMatch[2],
        indent: keyMatch[1].length,
        line: lineNum,
        isArrayItem: false,
      });
      continue;
    }

    // Match array items: - key: value (for arrays of objects)
    const arrayKeyMatch = line.match(/^(\s*)-\s+([a-zA-Z_][\w.-]*)\s*:/);
    if (arrayKeyMatch && arrayKeyMatch[1] !== undefined && arrayKeyMatch[2]) {
      keys.push({
        name: arrayKeyMatch[2],
        indent: arrayKeyMatch[1].length + 2, // Account for "- "
        line: lineNum,
        isArrayItem: true,
      });
    }
  }

  return keys;
}

/**
 * Convert flat keys to hierarchical symbols.
 * Groups keys by their indentation level.
 */
function convertKeysToSymbols(
  keys: YamlKey[],
  totalLines: number
): FileSymbol[] {
  if (keys.length === 0) {
    return [];
  }

  // Only include top-level keys (indent 0) and their immediate children
  const topLevelKeys = keys.filter((k) => k.indent === 0);

  if (topLevelKeys.length === 0) {
    // No top-level keys, return first level as roots
    const minIndent = Math.min(...keys.map((k) => k.indent));
    const roots = keys.filter((k) => k.indent === minIndent);
    return roots.map((k, idx) => {
      const nextRoot = roots[idx + 1];
      return {
        name: k.name,
        kind: SymbolKind.Property,
        startLine: k.line,
        endLine: nextRoot ? nextRoot.line - 1 : totalLines,
      };
    });
  }

  // Build hierarchy for top-level keys
  const symbols: FileSymbol[] = [];

  for (let i = 0; i < topLevelKeys.length; i++) {
    const current = topLevelKeys[i];
    const next = topLevelKeys[i + 1];
    const endLine = next ? next.line - 1 : totalLines;

    // Find immediate children (one level deeper)
    const childKeys = keys.filter((k) => {
      if (k.indent === 0) {
        return false;
      }
      if (k.line <= (current?.line ?? 0)) {
        return false;
      }
      if (next && k.line >= next.line) {
        return false;
      }
      // Only direct children (next indentation level)
      return k.indent === 2 || (k.indent > 0 && k.indent <= 4);
    });

    const children: FileSymbol[] | undefined =
      childKeys.length > 0
        ? childKeys.slice(0, 10).map((ck) => ({
            // Limit children
            name: ck.name,
            kind: ck.isArrayItem ? SymbolKind.Variable : SymbolKind.Property,
            startLine: ck.line,
            endLine: ck.line,
          }))
        : undefined;

    symbols.push({
      name: current?.name ?? "",
      kind: SymbolKind.Property,
      startLine: current?.line ?? 0,
      endLine,
      children,
    });
  }

  return symbols;
}

/**
 * Generate a file map for YAML files.
 */
export async function yamlMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    const content = await readFile(filePath, "utf8");

    if (signal?.aborted) {
      return null;
    }

    const totalLines = content.split("\n").length;
    const keys = extractYamlKeys(content);

    if (keys.length === 0) {
      return null;
    }

    const symbols = convertKeysToSymbols(keys, totalLines);

    if (symbols.length === 0) {
      return null;
    }

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "YAML",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`YAML mapper failed: ${error}`);
    return null;
  }
}

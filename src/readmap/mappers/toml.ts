/**
 * TOML mapper using regex-based section and key extraction.
 *
 * Extracts [sections], [[arrays]], and key-value pairs.
 */
import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

interface TomlSection {
  name: string;
  isArray: boolean;
  line: number;
  keys: { name: string; line: number }[];
}

/**
 * Extract TOML sections and their keys.
 */
function extractTomlStructure(content: string): TomlSection[] {
  const lines = content.split(/\r?\n/);
  const sections: TomlSection[] = [];

  // Implicit root section for top-level keys
  let currentSection: TomlSection = {
    name: "",
    isArray: false,
    line: 1,
    keys: [],
  };

  for (const [i, line] of lines.entries()) {
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    // Match [[array.section]]
    const arrayMatch = trimmed.match(/^\[\[([^\]]+)\]\]\s*(?:#.*)?$/);
    if (arrayMatch && arrayMatch[1]) {
      // Push previous section if it has content
      if (currentSection.name !== "" || currentSection.keys.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        name: arrayMatch[1],
        isArray: true,
        line: lineNum,
        keys: [],
      };
      continue;
    }

    // Match [section.name]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]\s*(?:#.*)?$/);
    if (sectionMatch && sectionMatch[1]) {
      // Push previous section if it has content
      if (currentSection.name !== "" || currentSection.keys.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        name: sectionMatch[1],
        isArray: false,
        line: lineNum,
        keys: [],
      };
      continue;
    }

    // Match key = value
    const keyMatch = trimmed.match(/^([a-zA-Z_][\w.-]*)\s*=/);
    if (keyMatch && keyMatch[1]) {
      currentSection.keys.push({
        name: keyMatch[1],
        line: lineNum,
      });
    }
  }

  // Push final section
  if (currentSection.name !== "" || currentSection.keys.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Convert TOML sections to FileSymbols.
 */
function convertSectionsToSymbols(
  sections: TomlSection[],
  totalLines: number
): FileSymbol[] {
  if (sections.length === 0) {
    return [];
  }

  const symbols: FileSymbol[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const nextSection = sections[i + 1];
    const endLine = nextSection ? nextSection.line - 1 : totalLines;

    // Build children from keys (limit to first 10)
    const children: FileSymbol[] | undefined =
      section && section.keys.length > 0
        ? section.keys.slice(0, 10).map((k) => ({
            name: k.name,
            kind: SymbolKind.Property,
            startLine: k.line,
            endLine: k.line,
          }))
        : undefined;

    // Root section (no name) just lists its keys
    if (section && section.name === "") {
      if (children) {
        symbols.push(...children);
      }
      continue;
    }

    if (!section) {
      continue;
    }

    symbols.push({
      name: section.isArray ? `[[${section.name}]]` : `[${section.name}]`,
      kind: section.isArray ? SymbolKind.Variable : SymbolKind.Class,
      startLine: section.line,
      endLine,
      children,
    });
  }

  return symbols;
}

/**
 * Generate a file map for TOML files.
 */
export async function tomlMapper(
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
    const sections = extractTomlStructure(content);

    if (sections.length === 0) {
      return null;
    }

    const symbols = convertSectionsToSymbols(sections, totalLines);

    if (symbols.length === 0) {
      return null;
    }

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "TOML",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`TOML mapper failed: ${error}`);
    return null;
  }
}

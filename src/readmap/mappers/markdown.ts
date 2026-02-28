/**
 * Markdown mapper using regex-based heading extraction.
 *
 * Extracts headings and code blocks as structural elements.
 */
import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

interface MarkdownHeading {
  level: number;
  text: string;
  line: number;
}

interface MarkdownCodeBlock {
  language: string | null;
  startLine: number;
  endLine: number;
}

interface MarkdownStructure {
  headings: MarkdownHeading[];
  codeBlocks: MarkdownCodeBlock[];
}

/**
 * Extract markdown structure (headings and code blocks).
 */
function extractMarkdownStructure(content: string): MarkdownStructure {
  const lines = content.split(/\r?\n/);
  const headings: MarkdownHeading[] = [];
  const codeBlocks: MarkdownCodeBlock[] = [];

  let inCodeBlock = false;
  let codeBlockStart = 0;
  let codeBlockLang: string | null = null;

  for (const [i, line] of lines.entries()) {
    const lineNum = i + 1;

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        codeBlocks.push({
          language: codeBlockLang,
          startLine: codeBlockStart,
          endLine: lineNum,
        });
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockStart = lineNum;
        codeBlockLang = line.slice(3).trim() || null;
      }
      continue;
    }

    if (inCodeBlock) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      headings.push({
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
        line: lineNum,
      });
    }
  }

  return { headings, codeBlocks };
}

/**
 * Convert markdown headings to FileSymbols.
 * Creates a nested hierarchy based on heading levels.
 */
function convertHeadingsToSymbols(
  headings: MarkdownHeading[],
  totalLines: number
): FileSymbol[] {
  if (headings.length === 0) {
    return [];
  }

  const rootSymbols: FileSymbol[] = [];

  // Calculate end lines for each heading (next heading start - 1, or totalLines)
  const headingsWithEnd = headings.map((h, i) => {
    const nextHeading = headings[i + 1];
    const endLine = nextHeading ? nextHeading.line - 1 : totalLines;
    return { ...h, endLine };
  });

  // Build hierarchy based on levels
  const stack: { symbol: FileSymbol; level: number }[] = [];

  for (const h of headingsWithEnd) {
    const symbol: FileSymbol = {
      name: h.text,
      kind: SymbolKind.Class, // Use Class for headings (visual hierarchy)
      startLine: h.line,
      endLine: h.endLine,
      signature: `${"#".repeat(h.level)} ${h.text}`,
    };

    // Pop stack until we find a parent with lower level
    let lastItem = stack.at(-1);
    while (stack.length > 0 && lastItem && lastItem.level >= h.level) {
      stack.pop();
      lastItem = stack.at(-1);
    }

    if (stack.length === 0) {
      // Root level
      rootSymbols.push(symbol);
    } else {
      // Add as child of last item in stack
      const parent = stack.at(-1)?.symbol;
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(symbol);
      }
    }

    stack.push({ symbol, level: h.level });
  }

  return rootSymbols;
}

/**
 * Generate a file map for Markdown files.
 */
export async function markdownMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Read file content
    const content = await readFile(filePath, "utf8");

    // Check for abort
    if (signal?.aborted) {
      return null;
    }

    // Extract structure
    const structure = extractMarkdownStructure(content);
    const totalLines = content.split("\n").length;

    // Convert headings to symbols
    const symbols = convertHeadingsToSymbols(structure.headings, totalLines);

    // If no headings, return null to fallback
    if (symbols.length === 0) {
      return null;
    }

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Markdown",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`Markdown mapper failed: ${error}`);
    return null;
  }
}

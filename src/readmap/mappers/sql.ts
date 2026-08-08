import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";
export const MAPPER_VERSION = 2;

/**
 * Regex patterns for SQL DDL statements.
 * Each pattern captures the statement type, optional schema/name, and we track line numbers.
 */
const SQL_PATTERNS = [
  // CREATE TABLE [schema.]name
  {
    regex:
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gim,
    kind: SymbolKind.Class,
    prefix: "TABLE",
  },
  // CREATE VIEW [schema.]name
  {
    regex:
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gim,
    kind: SymbolKind.Class,
    prefix: "VIEW",
  },
  // CREATE INDEX name ON table
  {
    regex:
      /^\s*CREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+)?(?:NONCLUSTERED\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?"?(\w+)"?\s+ON\s+"?(\w+)"?/gim,
    kind: SymbolKind.Variable,
    prefix: "INDEX",
    formatName: (match: RegExpExecArray) =>
      `${match[1]} ON ${match[2]}` as const,
  },
  // CREATE FUNCTION/PROCEDURE name
  {
    regex:
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*\S+\s+)?(?:AGGREGATE\s+)?(?:FUNCTION|PROCEDURE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gim,
    kind: SymbolKind.Function,
    prefix: "FUNCTION",
  },
  // CREATE TRIGGER name
  {
    regex:
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gim,
    kind: SymbolKind.Function,
    prefix: "TRIGGER",
  },
  // CREATE TYPE/DOMAIN name
  {
    regex:
      /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TYPE|DOMAIN)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gim,
    kind: SymbolKind.Class,
    prefix: "TYPE",
  },
  // CREATE SCHEMA name
  {
    regex:
      /^\s*CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:AUTHORIZATION\s+)?"?(\w+)"?/gim,
    kind: SymbolKind.Class,
    prefix: "SCHEMA",
  },
  // ALTER TABLE name
  {
    regex:
      /^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?/gim,
    kind: SymbolKind.Variable,
    prefix: "ALTER TABLE",
  },
];

interface SqlMatch {
  name: string;
  kind: SymbolKind;
  line: number;
  prefix: string;
}

/**
 * Find the end line for a SQL statement starting at a given line.
 * Looks for semicolon or next statement.
 */
type SqlQuoteEnd = "'" | '"' | "`" | "]";

interface SqlScanState {
  quoteEnd: SqlQuoteEnd | null;
  inBlockComment: boolean;
  dollarTag: string | null;
  blockDepth: number;
}

function isTopLevel(state: SqlScanState): boolean {
  return (
    !state.quoteEnd &&
    !state.inBlockComment &&
    !state.dollarTag &&
    state.blockDepth === 0
  );
}

function lineHasTopLevelTerminator(line: string, state: SqlScanState): boolean {
  let column = 0;

  while (column < line.length) {
    if (state.dollarTag) {
      if (line.startsWith(state.dollarTag, column)) {
        column += state.dollarTag.length;
        state.dollarTag = null;
      } else {
        column += 1;
      }
      continue;
    }

    if (state.inBlockComment) {
      if (line.startsWith("*/", column)) {
        state.inBlockComment = false;
        column += 2;
      } else {
        column += 1;
      }
      continue;
    }

    if (state.quoteEnd) {
      const quoteEnd = state.quoteEnd;
      if (line[column] === "\\" && quoteEnd !== "]") {
        column += 2;
        continue;
      }
      if (line[column] === quoteEnd) {
        if (line[column + 1] === quoteEnd) {
          column += 2;
        } else {
          state.quoteEnd = null;
          column += 1;
        }
      } else {
        column += 1;
      }
      continue;
    }

    if (line.startsWith("--", column)) {
      break;
    }
    if (line.startsWith("/*", column)) {
      state.inBlockComment = true;
      column += 2;
      continue;
    }

    const character = line[column];
    if (character === "'" || character === '"' || character === "`") {
      state.quoteEnd = character;
      column += 1;
      continue;
    }
    if (character === "[") {
      state.quoteEnd = "]";
      column += 1;
      continue;
    }

    if (character === "$") {
      const dollarMatch = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
        line.slice(column),
      );
      if (dollarMatch) {
        state.dollarTag = dollarMatch[0];
        column += dollarMatch[0].length;
        continue;
      }
    }

    if (character && /[A-Za-z_]/.test(character)) {
      const word = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(line.slice(column))?.[0];
      if (word) {
        if (word.toUpperCase() === "BEGIN") {
          state.blockDepth += 1;
        } else if (word.toUpperCase() === "END" && state.blockDepth > 0) {
          state.blockDepth -= 1;
        }
        column += word.length;
        continue;
      }
    }

    if (character === ";" && state.blockDepth === 0) {
      return true;
    }

    column += 1;
  }

  return false;
}

function findStatementEnd(lines: string[], startIdx: number): number {
  const state: SqlScanState = {
    quoteEnd: null,
    inBlockComment: false,
    dollarTag: null,
    blockDepth: 0,
  };

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (
      i > startIdx &&
      isTopLevel(state) &&
      /^\s*(CREATE|ALTER)\s+/i.test(line)
    ) {
      return i;
    }

    if (lineHasTopLevelTerminator(line, state)) {
      return i + 1;
    }
  }

  return lines.length;
}

/**
 * Generate a file map for a SQL file using regex patterns.
 */
export async function sqlMapper(
  filePath: string,
  _signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const matches: SqlMatch[] = [];

    // Track processed lines to avoid duplicates
    const processedLines = new Set<number>();

    for (const pattern of SQL_PATTERNS) {
      // Reset regex state
      pattern.regex.lastIndex = 0;

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (!line) {
          continue;
        }

        // Reset regex for this line
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(line);

        if (match) {
          const lineNum = lineIdx + 1; // 1-indexed

          // Skip if already processed this line
          if (processedLines.has(lineNum)) {
            continue;
          }
          processedLines.add(lineNum);

          // Get the name - use formatName if provided, otherwise use last captured group
          let name: string;
          if ("formatName" in pattern && pattern.formatName) {
            name =
              typeof pattern.formatName === "function"
                ? pattern.formatName(match)
                : (match[2] ?? match[1] ?? "unknown");
          } else {
            name = match[2] ?? match[1] ?? "unknown";
          }

          matches.push({
            name,
            kind: pattern.kind,
            line: lineNum,
            prefix: pattern.prefix,
          });
        }
      }
    }

    // Sort matches by line number
    matches.sort((a, b) => a.line - b.line);

    // Convert to symbols with end lines
    const symbols: FileSymbol[] = matches.map((m, idx) => {
      const startLine = m.line;
      const nextMatch = matches[idx + 1];
      const nextStart = nextMatch ? nextMatch.line : totalLines + 1;
      const endLine = findStatementEnd(lines, startLine - 1);

      return {
        name: `${m.prefix} ${m.name}`,
        kind: m.kind,
        startLine,
        endLine: Math.min(endLine, nextStart - 1),
      };
    });

    // Contract: no extracted declarations means "miss" so generateMapWithIdentity
    // can continue to ctags and then the regex fallback.
    if (symbols.length === 0) {
      return null;
    }

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "SQL",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    console.error(`SQL mapper failed: ${error}`);
    return null;
  }
}

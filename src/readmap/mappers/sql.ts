import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

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
function findStatementEnd(lines: string[], startIdx: number): number {
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }
    // Statement ends with semicolon
    if (line.includes(";")) {
      return i + 1; // 1-indexed
    }
    // Next CREATE/ALTER starts a new statement
    if (i > startIdx && /^\s*(CREATE|ALTER)\s+/i.test(line)) {
      return i; // Previous line was end
    }
  }
  return lines.length; // File end
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

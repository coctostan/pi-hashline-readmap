/**
 * CSV/TSV mapper using in-process parsing.
 *
 * Extracts header columns, row count, and sample data.
 */
import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

/**
 * Detect delimiter (comma or tab) from first line.
 */
function detectDelimiter(firstLine: string): string {
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? "\t" : ",";
}

/**
 * Parse a CSV/TSV line respecting quoted fields.
 */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Generate a file map for CSV/TSV files.
 */
export async function csvMapper(
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

    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
    const totalLines = content.split("\n").length;

    if (lines.length === 0) {
      return null;
    }

    const [firstLine] = lines;
    if (!firstLine) {
      return null;
    }

    const delimiter = detectDelimiter(firstLine);
    const headers = parseLine(firstLine, delimiter);

    if (headers.length === 0) {
      return null;
    }

    // Create symbols from headers
    const symbols: FileSymbol[] = headers.map((header, idx) => ({
      name: header || `Column ${idx + 1}`,
      kind: SymbolKind.Property,
      startLine: 1,
      endLine: 1,
      signature: `Column ${idx + 1} of ${headers.length}`,
    }));

    // Add summary symbol with row count
    const dataRows = lines.length - 1;
    symbols.unshift({
      name: `${dataRows} rows × ${headers.length} columns`,
      kind: SymbolKind.Table,
      startLine: 1,
      endLine: totalLines,
    });

    // Add sample of first data row if available
    if (lines.length > 1) {
      const [, sampleLine] = lines;
      if (sampleLine) {
        const sampleValues = parseLine(sampleLine, delimiter);
        const samplePreview = sampleValues
          .slice(0, 5)
          .map((v) => (v.length > 20 ? `${v.slice(0, 17)}...` : v))
          .join(delimiter === "\t" ? " | " : ", ");

        symbols.push({
          name: `Sample: ${samplePreview}`,
          kind: SymbolKind.Variable,
          startLine: 2,
          endLine: 2,
        });
      }
    }

    const isTsv = filePath.endsWith(".tsv") || delimiter === "\t";

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: isTsv ? "TSV" : "CSV",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`CSV mapper failed: ${error}`);
    return null;
  }
}

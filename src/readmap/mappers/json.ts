import { exec } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

const execAsync = promisify(exec);

/**
 * jq script to extract JSON schema structure.
 * Returns a compact representation of the JSON structure.
 */
const JQ_SCHEMA_SCRIPT = `
def type_name:
  if type == "array" then
    if length == 0 then "[]"
    elif (.[0] | type) == "object" then "[](\\(length)) {...}"
    elif (.[0] | type) == "array" then "[](\\(length)) [...]"
    else "[](\\(length)) \\(.[0] | type)"
    end
  elif type == "object" then "{...}"
  elif type == "string" then "string"
  elif type == "number" then "number"
  elif type == "boolean" then "boolean"
  elif type == "null" then "null"
  else type
  end;

def schema(depth):
  if depth > 4 then "..."
  elif type == "object" then
    to_entries | map({key: .key, value: (.value | type_name)}) | from_entries
  elif type == "array" and length > 0 then
    if (.[0] | type) == "object" then
      { "[]": (.[0] | schema(depth + 1)), "_count": length }
    else
      { "[]": (.[0] | type_name), "_count": length }
    end
  else
    type_name
  end;

schema(0)
`;

interface JsonSchema {
  [key: string]: string | number | JsonSchema;
}

/**
 * Convert JSON schema to symbols.
 */
function schemaToSymbols(
  schema: JsonSchema,
  _prefix = "",
  startLine = 1
): { symbols: FileSymbol[]; lineEstimate: number } {
  const symbols: FileSymbol[] = [];
  let lineEstimate = startLine;

  for (const [key, value] of Object.entries(schema)) {
    if (key === "_count") {
      continue;
    }

    if (typeof value === "string") {
      // Leaf value
      symbols.push({
        name: `${key}: ${value}`,
        kind: SymbolKind.Variable,
        startLine: lineEstimate,
        endLine: lineEstimate,
      });
      lineEstimate++;
    } else if (typeof value === "object" && value !== null) {
      // Nested object
      const count = (schema["_count"] as number) || 1;
      const countSuffix = count > 1 ? ` (${count} items)` : "";

      if (key === "[]") {
        // Array element
        const { symbols: childSymbols, lineEstimate: newLine } =
          schemaToSymbols(value as JsonSchema, key, lineEstimate);
        for (const child of childSymbols) {
          child.name = `[].${child.name}`;
        }
        symbols.push(...childSymbols);
        lineEstimate = newLine;
      } else {
        // Object property
        symbols.push({
          name: `${key}${countSuffix}`,
          kind: SymbolKind.Class,
          startLine: lineEstimate,
          endLine: lineEstimate + 10, // Estimate
        });
        const { symbols: childSymbols, lineEstimate: newLine } =
          schemaToSymbols(value as JsonSchema, key, lineEstimate + 1);
        const lastSymbol = symbols.at(-1);
        if (lastSymbol) {
          lastSymbol.children = childSymbols;
        }
        lineEstimate = newLine;
      }
    }
  }

  return { symbols, lineEstimate };
}

/**
 * Check if jq is available.
 */
async function hasJq(): Promise<boolean> {
  try {
    await execAsync("jq --version", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a file map for a JSON file using jq.
 */
export async function jsonMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    // Check if jq is available
    if (!(await hasJq())) {
      console.error("JSON mapper: jq not available");
      return null;
    }

    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Count lines
    const { stdout: wcOutput } = await execAsync(`wc -l < "${filePath}"`, {
      signal,
    });
    const totalLines = Number.parseInt(wcOutput.trim(), 10) || 1;

    // Run jq to extract schema
    const { stdout, stderr } = await execAsync(
      `jq '${JQ_SCHEMA_SCRIPT.replaceAll("'", "'\\''")}' "${filePath}"`,
      {
        signal,
        timeout: 10_000,
        maxBuffer: 1024 * 1024, // 1MB
      }
    );

    if (!stdout) {
      if (stderr) {
        console.error(`JSON mapper jq stderr: ${stderr}`);
      }
      return null;
    }

    const schema = JSON.parse(stdout) as JsonSchema;
    const { symbols } = schemaToSymbols(schema);

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "JSON",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`JSON mapper failed: ${error}`);
    return null;
  }
}

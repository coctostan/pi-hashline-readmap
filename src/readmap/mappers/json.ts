// NOTE: This mapper invokes jq as a subprocess. Use `execFile` (no shell) with
// an args array — never `exec` with template interpolation — so paths containing
// shell metacharacters are passed safely as argv entries. See GH #116.
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

import type { FileMap } from "../types.js";
import { DetailLevel } from "../enums.js";
import { symbolsFromJsonSource } from "./json-source.js";

export const MAPPER_VERSION = 2;

const execFileAsync = promisify(execFile);

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

async function hasJq(): Promise<boolean> {
  try {
    await execFileAsync("jq", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function jsonMapper(
  filePath: string,
  signal?: AbortSignal,
): Promise<FileMap | null> {
  try {
    if (!(await hasJq())) {
      console.error("JSON mapper: jq not available");
      return null;
    }

    const stats = await stat(filePath);
    const totalBytes = stats.size;
    const fileText = await readFile(filePath, "utf8");
    const totalLines = Math.max(1, fileText.split("\n").length);

    const { stdout, stderr } = await execFileAsync(
      "jq",
      [JQ_SCHEMA_SCRIPT, filePath],
      {
        signal,
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      },
    );

    if (!stdout) {
      if (stderr) console.error(`JSON mapper jq stderr: ${stderr}`);
      return null;
    }

    const symbols = symbolsFromJsonSource(fileText);
    if (symbols.length === 0) return null;

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
    if (signal?.aborted) return null;
    console.error(`JSON mapper failed: ${error}`);
    return null;
  }
}

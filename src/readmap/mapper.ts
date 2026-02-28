import type { FileMap, MapOptions } from "./types.js";

import { THRESHOLDS } from "./constants.js";
import { detectLanguage } from "./language-detect.js";
import { cMapper } from "./mappers/c.js";
import { clojureMapper } from "./mappers/clojure.js";
import { cppMapper } from "./mappers/cpp.js";
import { csvMapper } from "./mappers/csv.js";
import { ctagsMapper } from "./mappers/ctags.js";
import { fallbackMapper } from "./mappers/fallback.js";
import { goMapper } from "./mappers/go.js";
import { jsonMapper } from "./mappers/json.js";
import { jsonlMapper } from "./mappers/jsonl.js";
import { markdownMapper } from "./mappers/markdown.js";
import { pythonMapper } from "./mappers/python.js";
import { rustMapper } from "./mappers/rust.js";
import { sqlMapper } from "./mappers/sql.js";
import { tomlMapper } from "./mappers/toml.js";
import { typescriptMapper } from "./mappers/typescript.js";
import { yamlMapper } from "./mappers/yaml.js";

type MapperFn = (
  filePath: string,
  signal?: AbortSignal
) => Promise<FileMap | null>;

/**
 * Registry of language-specific mappers.
 *
 * Uses internal tree-sitter/ts-morph mappers for all supported languages.
 */
const MAPPERS: Record<string, MapperFn> = {
  // Phase 1: Python AST-based
  python: pythonMapper,

  // Phase 2: Go AST-based
  go: goMapper,

  // Phase 3: Internal ts-morph mappers
  typescript: typescriptMapper,
  javascript: typescriptMapper,

  // Phase 3: Internal regex-based markdown
  markdown: markdownMapper,

  // Phase 3: Internal tree-sitter mappers
  rust: rustMapper,
  cpp: cppMapper,
  "c-header": cppMapper, // .h files

  // Phase 2: Regex/subprocess mappers
  sql: sqlMapper,
  json: jsonMapper,
  jsonl: jsonlMapper,
  c: cMapper, // .c files use regex

  // Phase 4: Extended coverage
  yaml: yamlMapper,
  toml: tomlMapper,
  csv: csvMapper,

  // Phase 5: Clojure tree-sitter
  clojure: clojureMapper,
};

/**
 * Generate a structural map for a file.
 *
 * Dispatches to the appropriate language-specific mapper,
 * falling back to ctags (if available) then grep-based extraction.
 */
export async function generateMap(
  filePath: string,
  options: MapOptions = {}
): Promise<FileMap | null> {
  const { signal } = options;

  // Detect language
  const langInfo = detectLanguage(filePath);

  if (!langInfo) {
    // Unknown language, try ctags then fallback
    const ctagsResult = await ctagsMapper(filePath, signal);
    if (ctagsResult) {
      return ctagsResult;
    }
    return fallbackMapper(filePath, signal);
  }

  // Try language-specific mapper
  const mapper = MAPPERS[langInfo.id];

  if (mapper) {
    const result = await mapper(filePath, signal);
    if (result) {
      return result;
    }
    // Mapper failed, fall through to ctags/fallback
  }

  // Try ctags as intermediate fallback (better than grep when available)
  const ctagsResult = await ctagsMapper(filePath, signal);
  if (ctagsResult) {
    return ctagsResult;
  }

  // Use grep-based fallback mapper
  return fallbackMapper(filePath, signal);
}

/**
 * Check if a file should have a map generated.
 * Returns true if the file exceeds the truncation threshold.
 */
export function shouldGenerateMap(
  totalLines: number,
  totalBytes: number
): boolean {
  return totalLines > THRESHOLDS.MAX_LINES || totalBytes > THRESHOLDS.MAX_BYTES;
}

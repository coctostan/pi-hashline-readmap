import type { FileMap, MapOptions } from "./types.js";
import { isGdscriptMappingEnabled } from "../hashline-settings.js";

import { THRESHOLDS } from "./constants.js";
import { detectLanguage } from "./language-detect.js";
import { cMapper, MAPPER_VERSION as C_VERSION } from "./mappers/c.js";
import { cppMapper, MAPPER_VERSION as CPP_VERSION } from "./mappers/cpp.js";
import { csvMapper, MAPPER_VERSION as CSV_VERSION } from "./mappers/csv.js";
import { ctagsMapper, MAPPER_VERSION as CTAGS_VERSION } from "./mappers/ctags.js";
import { fallbackMapper, MAPPER_VERSION as FALLBACK_VERSION } from "./mappers/fallback.js";
import { goMapper, MAPPER_VERSION as GO_VERSION } from "./mappers/go.js";
import { gdscriptMapper, MAPPER_VERSION as GDSCRIPT_VERSION } from "./mappers/gdscript.js";
import { jsonMapper, MAPPER_VERSION as JSON_VERSION } from "./mappers/json.js";
import { javaMapper, javaMapperFromContent, MAPPER_VERSION as JAVA_VERSION } from "./mappers/java.js";
import { jsonlMapper, MAPPER_VERSION as JSONL_VERSION } from "./mappers/jsonl.js";
import { markdownMapper, MAPPER_VERSION as MARKDOWN_VERSION } from "./mappers/markdown.js";
import { pythonMapper, MAPPER_VERSION as PYTHON_VERSION } from "./mappers/python.js";
import { rustMapper, rustMapperFromContent, MAPPER_VERSION as RUST_VERSION } from "./mappers/rust.js";
import { shellMapper, MAPPER_VERSION as SHELL_VERSION } from "./mappers/shell.js";
import { sqlMapper, MAPPER_VERSION as SQL_VERSION } from "./mappers/sql.js";
import { swiftMapper, MAPPER_VERSION as SWIFT_VERSION } from "./mappers/swift.js";
import { tomlMapper, MAPPER_VERSION as TOML_VERSION } from "./mappers/toml.js";
import { typescriptMapper, typescriptMapperFromContent, MAPPER_VERSION as TYPESCRIPT_VERSION } from "./mappers/typescript.js";
import { yamlMapper, MAPPER_VERSION as YAML_VERSION } from "./mappers/yaml.js";

type MapperFn = (
  filePath: string,
  signal?: AbortSignal
) => Promise<FileMap | null>;

/**
 * Registry of language-specific mappers.
 *
 * Uses internal tree-sitter/ts-morph mappers for all supported languages.
 */
interface MapperEntry {
  fn: MapperFn;
  version: number;
}

const MAPPERS_V: Record<string, MapperEntry> = {
  // Phase 1: Python AST-based
  python: { fn: pythonMapper, version: PYTHON_VERSION },
  // Phase 2: Go AST-based
  go: { fn: goMapper, version: GO_VERSION },
  gdscript: { fn: gdscriptMapper, version: GDSCRIPT_VERSION },
  // Phase 3: Internal ts-morph mappers
  typescript: { fn: typescriptMapper, version: TYPESCRIPT_VERSION },
  javascript: { fn: typescriptMapper, version: TYPESCRIPT_VERSION },
  // Phase 3: Internal regex-based markdown
  markdown: { fn: markdownMapper, version: MARKDOWN_VERSION },
  // Phase 3: Internal tree-sitter mappers
  rust: { fn: rustMapper, version: RUST_VERSION },
  cpp: { fn: cppMapper, version: CPP_VERSION },
  "c-header": { fn: cppMapper, version: CPP_VERSION }, // .h files
  // Phase 8: Java tree-sitter mapper
  java: { fn: javaMapper, version: JAVA_VERSION },
  // Phase 2: Regex/subprocess mappers
  sql: { fn: sqlMapper, version: SQL_VERSION },
  json: { fn: jsonMapper, version: JSON_VERSION },
  jsonl: { fn: jsonlMapper, version: JSONL_VERSION },
  c: { fn: cMapper, version: C_VERSION }, // .c files use regex
  // Phase 4: Extended coverage
  yaml: { fn: yamlMapper, version: YAML_VERSION },
  toml: { fn: tomlMapper, version: TOML_VERSION },
  csv: { fn: csvMapper, version: CSV_VERSION },
  // Phase 6: Swift regex mapper
  swift: { fn: swiftMapper, version: SWIFT_VERSION },
  // Phase 7: Shell/Bash regex mapper
  shell: { fn: shellMapper, version: SHELL_VERSION },
};

type ContentMapperFn = (
  filePath: string,
  content: string,
  signal?: AbortSignal
) => Promise<FileMap | null>;

/**
 * Registry of precise content-accepting (no-disk-I/O) mappers.
 * Languages without a dedicated content mapper return null so mutating callers
 * never rely on fallback ranges for replacement.
 */
const CONTENT_MAPPERS: Record<string, ContentMapperFn> = {
  typescript: typescriptMapperFromContent,
  javascript: typescriptMapperFromContent,
  rust: rustMapperFromContent,
  java: javaMapperFromContent,
};


export const ALL_MAPPER_IDENTITIES: Record<string, MapperIdentity> = Object.fromEntries([
  ...Object.entries(MAPPERS_V).map(
    ([id, entry]) => [id, { mapperName: id, mapperVersion: entry.version }] as const,
  ),
  ["ctags", { mapperName: "ctags", mapperVersion: CTAGS_VERSION }],
  ["fallback", { mapperName: "fallback", mapperVersion: FALLBACK_VERSION }],
]);

export interface MapperIdentity {
  mapperName: string;
  mapperVersion: number;
}

export interface MapResultWithIdentity extends MapperIdentity {
  map: FileMap | null;
}

/**
 * Generate a structural map for a file with mapper identity metadata.
 *
 * Dispatches to the appropriate language-specific mapper,
 * falling back to ctags (if available) then grep-based extraction.
 */
export async function generateMapWithIdentity(
  filePath: string,
  options: MapOptions = {}
): Promise<MapResultWithIdentity> {
  const { signal } = options;
  const langInfo = detectLanguage(filePath);
  if (langInfo) {
    const entry = MAPPERS_V[langInfo.id];
    const mapperEnabled = langInfo.id !== "gdscript" || isGdscriptMappingEnabled();
    if (entry && mapperEnabled) {
      const result = await entry.fn(filePath, signal);
      if (result) {
        return { map: result, mapperName: langInfo.id, mapperVersion: entry.version };
      }
    }
  }

  const ctagsResult = await ctagsMapper(filePath, signal);
  if (ctagsResult) {
    return { map: ctagsResult, mapperName: "ctags", mapperVersion: CTAGS_VERSION };
  }

  const fbResult = await fallbackMapper(filePath, signal);
  return { map: fbResult, mapperName: "fallback", mapperVersion: FALLBACK_VERSION };
}

/**
 * Generate a structural map for a file.
 */
export async function generateMap(
  filePath: string,
  options: MapOptions = {}
): Promise<FileMap | null> {
  return (await generateMapWithIdentity(filePath, options)).map;
}

/**
 * Generate a structural map from in-memory content.
 *
 * Unlike `generateMap`, this function does not create temp directories, write
 * to disk, or call `readFile`/`stat`. `filePath` is preserved as map identity
 * and parser-extension context, but is never read from disk.
 *
 * Returns null when no precise content-capable mapper is registered for the
 * file's language, or when the mapper itself returns null.
 */
export async function generateMapFromContent(
  filePath: string,
  content: string,
  options: MapOptions = {}
): Promise<FileMap | null> {
  const { signal } = options;
  const langInfo = detectLanguage(filePath);
  if (!langInfo) return null;
  const fn = CONTENT_MAPPERS[langInfo.id];
  if (!fn) return null;
  return fn(filePath, content, signal);
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

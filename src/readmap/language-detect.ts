import { extname } from "node:path";

import type { LanguageInfo } from "./types.js";

/**
 * Map of file extensions to language info.
 */
const EXTENSION_MAP: Record<string, LanguageInfo> = {
  // Python
  ".py": { id: "python", name: "Python" },
  ".pyw": { id: "python", name: "Python" },
  ".pyi": { id: "python", name: "Python" },

  // TypeScript
  ".ts": { id: "typescript", name: "TypeScript" },
  ".tsx": { id: "typescript", name: "TypeScript" },
  ".mts": { id: "typescript", name: "TypeScript" },
  ".cts": { id: "typescript", name: "TypeScript" },

  // JavaScript
  ".js": { id: "javascript", name: "JavaScript" },
  ".jsx": { id: "javascript", name: "JavaScript" },
  ".mjs": { id: "javascript", name: "JavaScript" },
  ".cjs": { id: "javascript", name: "JavaScript" },

  // Go
  ".go": { id: "go", name: "Go" },

  // Rust
  ".rs": { id: "rust", name: "Rust" },

  // C/C++
  ".c": { id: "c", name: "C" },
  ".h": { id: "c-header", name: "C Header" },
  ".cpp": { id: "cpp", name: "C++" },
  ".cc": { id: "cpp", name: "C++" },
  ".cxx": { id: "cpp", name: "C++" },
  ".hpp": { id: "cpp", name: "C++" },
  ".hxx": { id: "cpp", name: "C++" },

  // Clojure
  ".clj": { id: "clojure", name: "Clojure" },
  ".cljs": { id: "clojure", name: "ClojureScript" },
  ".cljc": { id: "clojure", name: "Clojure" },
  ".edn": { id: "clojure", name: "EDN" },

  // SQL
  ".sql": { id: "sql", name: "SQL" },

  // JSON
  ".json": { id: "json", name: "JSON" },
  ".jsonc": { id: "json", name: "JSON" },

  // JSON Lines
  ".jsonl": { id: "jsonl", name: "JSON Lines" },

  // Markdown
  ".md": { id: "markdown", name: "Markdown" },
  ".mdx": { id: "markdown", name: "Markdown" },

  // YAML
  ".yml": { id: "yaml", name: "YAML" },
  ".yaml": { id: "yaml", name: "YAML" },

  // TOML
  ".toml": { id: "toml", name: "TOML" },

  // CSV
  ".csv": { id: "csv", name: "CSV" },
  ".tsv": { id: "csv", name: "TSV" },
};

/**
 * Detect language from file path.
 * Returns null for unknown file types.
 */
export function detectLanguage(filePath: string): LanguageInfo | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Get all supported extensions.
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_MAP);
}

/**
 * Check if a file extension is supported.
 */
export function isSupported(filePath: string): boolean {
  return detectLanguage(filePath) !== null;
}

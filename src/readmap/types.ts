import type { DetailLevel, SymbolKind } from "./enums.js";

/**
 * Represents a symbol extracted from a file.
 */
export interface FileSymbol {
  /** Symbol name (e.g., class name, function name) */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Ending line number (1-indexed) */
  endLine: number;
  /** Optional signature (for functions/methods) */
  signature?: string;
  /** Child symbols (for nested structures like methods in classes) */
  children?: FileSymbol[];
  /** Additional modifiers (async, static, etc.) */
  modifiers?: string[];
  /** First line of JSDoc / docstring (if present) */
  docstring?: string;
  /** Whether this symbol is exported from its module */
  isExported?: boolean;
}

/**
 * Information about truncated symbol display.
 */
export interface TruncatedInfo {
  /** Total number of symbols in the original file */
  totalSymbols: number;
  /** Number of symbols shown in the truncated view */
  shownSymbols: number;
  /** Number of symbols omitted from the truncated view */
  omittedSymbols: number;
}

/**
 * Result of generating a file map.
 */
export interface FileMap {
  /** Absolute file path */
  path: string;
  /** Total line count */
  totalLines: number;
  /** Total file size in bytes */
  totalBytes: number;
  /** Detected language */
  language: string;
  /** Extracted symbols */
  symbols: FileSymbol[];
  /** Module imports / dependencies */
  imports: string[];
  /** Detail level used for this map */
  detailLevel: DetailLevel;
  /** Truncation metadata (present when symbols are truncated) */
  truncatedInfo?: TruncatedInfo;
}

/**
 * Map generation options.
 */
export interface MapOptions {
  /** Maximum map size in bytes (default: 20KB) */
  maxBytes?: number;
  /** Abort signal */
  signal?: AbortSignal;
}

/**
 * Language information.
 */
export interface LanguageInfo {
  /** Language identifier */
  id: string;
  /** Display name */
  name: string;
}

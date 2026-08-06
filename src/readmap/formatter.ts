import { basename } from "node:path";

import type { FileMap, FileSymbol } from "./types.js";

import { THRESHOLDS } from "./constants.js";
import { DetailLevel, SymbolKind } from "./enums.js";

const BOX_LINE = "───────────────────────────────────────";

/**
 * Format a file size for display.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format a number with comma separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

const IDENTIFIER_CHAR = /[\p{L}\p{N}_$]/u;
const VARIABLE_LIKE_KINDS = new Set<SymbolKind>([
  SymbolKind.Variable,
  SymbolKind.Constant,
  SymbolKind.Property,
]);

function matchingLeadingParenthesis(text: string): number {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "(") depth++;
    if (text[index] === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function nameTokenPositions(signature: string, name: string): number[] {
  const candidates = [...new Set([name, name.split(/::|\./).at(-1) ?? name])];
  const positions: number[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    let searchFrom = 0;
    while (searchFrom < signature.length) {
      const index = signature.indexOf(candidate, searchFrom);
      if (index === -1) break;
      const before = index > 0 ? signature[index - 1] : "";
      const after = signature.slice(
        index + candidate.length,
        index + candidate.length + 1,
      );
      if (!IDENTIFIER_CHAR.test(before) && !IDENTIFIER_CHAR.test(after)) {
        positions.push(index);
      }
      searchFrom = index + candidate.length;
    }
  }
  return positions;
}

/**
 * A variable-like signature declares its symbol when the name sits in
 * declaration position: first (TypeScript `pending: Promise<void>[]`, `nextId`)
 * or after a real prefix (Rust `pub items: Vec<T>`, C `int id`,
 * C++ `void (*callback)(int)`). Bare type suffixes such as Go's `string` or
 * `*id` stay name-less and are prefixed by the formatter instead.
 */
function variableSignatureDeclaresSymbol(signature: string, name: string): boolean {
  return nameTokenPositions(signature, name).some((index) => {
    if (index === 0) return true;
    const prefix = signature.slice(0, index);
    return /\s/.test(prefix) && /[\s*&)]/.test(signature.slice(index - 1, index));
  });
}

function signatureDeclaresSymbol(symbol: FileSymbol): boolean {
  const { name, signature } = symbol;
  if (!name || !signature) return false;

  const trimmed = signature.trimStart();
  const asyncPrefix = trimmed.startsWith("async ");
  const callShaped = asyncPrefix
    ? trimmed.slice("async ".length).trimStart()
    : trimmed;

  if (!callShaped.startsWith("(")) {
    return VARIABLE_LIKE_KINDS.has(symbol.kind)
      ? variableSignatureDeclaresSymbol(signature, name)
      : nameTokenPositions(signature, name).length > 0;
  }
  if (asyncPrefix) return false;

  const receiverEnd = matchingLeadingParenthesis(callShaped);
  if (receiverEnd === -1) return false;
  const leafName = name.split(/::|\./).at(-1) ?? name;
  const afterReceiver = callShaped.slice(receiverEnd + 1).trimStart();
  if (!afterReceiver.startsWith(leafName)) return false;
  const boundary = afterReceiver.slice(leafName.length, leafName.length + 1);
  if (IDENTIFIER_CHAR.test(boundary)) return false;
  return afterReceiver.slice(leafName.length).trimStart().startsWith("(");
}

function appendPartialSignature(symbol: FileSymbol, name: string): string {
  let signature = symbol.signature ?? "";
  const modifiers = [...(symbol.modifiers ?? [])];
  if (signature.trimStart().startsWith("async ")) {
    signature = signature.trimStart().slice("async ".length).trimStart();
    if (!modifiers.includes("async")) modifiers.unshift("async");
  }
  if (modifiers.length) name = `${modifiers.join(" ")} ${name}`;
  const separator = signature.trimStart().startsWith("(") ? "" : ": ";
  return `${name}${separator}${signature}`;
}

/**
 * Format a symbol for display.
 */
function formatSymbol(
  symbol: FileSymbol,
  level: DetailLevel,
  indent = 0
): string {
  const prefix = "  ".repeat(indent);
  const lineRange =
    symbol.startLine === symbol.endLine
      ? `[${symbol.startLine}]`
      : `[${symbol.startLine}-${symbol.endLine}]`;

  let { name } = symbol;

  if (level === DetailLevel.Full) {
    if (symbol.signature) {
      name = signatureDeclaresSymbol(symbol)
        ? symbol.signature
        : appendPartialSignature(symbol, name);
    } else if (symbol.modifiers?.length) {
      name = `${symbol.modifiers.join(" ")} ${name}`;
    }
  }

  // Format based on kind
  let formatted: string;
  switch (symbol.kind) {
    case "class":
    case "interface":
    case "struct":
    case "enum":
    case "type": {
      formatted = `${prefix}${symbol.kind} ${name}: ${lineRange}`;
      break;
    }
    case "function":
    case "method": {
      formatted = `${prefix}${name}: ${lineRange}`;
      break;
    }
    case "variable":
    case "constant": {
      formatted = `${prefix}${name} = ... ${lineRange}`;
      break;
    }
    default: {
      formatted = `${prefix}${name}: ${lineRange}`;
    }
  }

  // Append docstring at Full detail level
  if (level === DetailLevel.Full && symbol.docstring) {
    formatted += ` — ${symbol.docstring}`;
  }

  return formatted;
}

/**
 * Format symbols recursively.
 */
function formatSymbols(
  symbols: FileSymbol[],
  level: DetailLevel,
  indent = 0
): string[] {
  const lines: string[] = [];

  for (const symbol of symbols) {
    lines.push(formatSymbol(symbol, level, indent));

    // Add children for full, compact, and minimal levels (not outline or truncated)
    if (
      level !== DetailLevel.Outline &&
      level !== DetailLevel.Truncated &&
      symbol.children?.length
    ) {
      // For minimal, flatten children
      if (level === DetailLevel.Minimal) {
        for (const child of symbol.children) {
          lines.push(formatSymbol(child, level, indent + 1));
        }
      } else {
        lines.push(...formatSymbols(symbol.children, level, indent + 1));
      }
    }
  }

  return lines;
}

/**
 * Format a complete file map to a string.
 */
export function formatFileMap(map: FileMap, level?: DetailLevel): string {
  const effectiveLevel = level ?? map.detailLevel;
  const fileName = basename(map.path);

  const lines: string[] = [
    "",
    BOX_LINE,
    `File Map: ${fileName}`,
    `${formatNumber(map.totalLines)} lines │ ${formatSize(map.totalBytes)} │ ${map.language}`,
    BOX_LINE,
    "",
  ];

  // Add detail level notice if reduced from Full
  if (map.truncatedInfo) {
    const { shownSymbols, totalSymbols } = map.truncatedInfo;
    lines.push(
      `[Map ≤${formatSize(THRESHOLDS.MAX_TRUNCATED_BYTES)} | ${shownSymbols} of ${formatNumber(totalSymbols)} symbols]`
    );
    lines.push("");
  } else if (effectiveLevel === DetailLevel.Outline) {
    lines.push(`[Map ≤${formatSize(THRESHOLDS.MAX_OUTLINE_BYTES)} | outline]`);
    lines.push("");
  } else if (effectiveLevel === DetailLevel.Minimal) {
    lines.push(`[Map ≤${formatSize(THRESHOLDS.MAX_MAP_BYTES)} | minimal]`);
    lines.push("");
  } else if (effectiveLevel === DetailLevel.Compact) {
    lines.push(
      `[Map ≤${formatSize(THRESHOLDS.COMPACT_TARGET_BYTES)} | compact]`
    );
    lines.push("");
  }

  // Add imports if present and not outline or truncated level
  if (
    effectiveLevel !== DetailLevel.Outline &&
    effectiveLevel !== DetailLevel.Truncated &&
    map.imports.length > 0
  ) {
    const importList =
      map.imports.length > 10
        ? [...map.imports.slice(0, 10), `...${map.imports.length - 10} more`]
        : map.imports;
    lines.push(`imports: ${importList.join(", ")}`);
    lines.push("");
  }

  // Add symbols
  if (map.truncatedInfo) {
    // Truncated format: first half, separator, second half
    const half = Math.floor(map.symbols.length / 2);
    const firstSymbols = map.symbols.slice(0, half);
    const lastSymbols = map.symbols.slice(half);

    // Format first batch
    const firstLines = formatSymbols(firstSymbols, effectiveLevel);
    lines.push(...firstLines);

    // Add separator
    lines.push("");
    lines.push(
      `  ─ ─ ─ ${formatNumber(map.truncatedInfo.omittedSymbols)} more symbols ─ ─ ─`
    );
    lines.push("");

    // Format last batch
    const lastLines = formatSymbols(lastSymbols, effectiveLevel);
    lines.push(...lastLines);
  } else {
    // Normal format
    const symbolLines = formatSymbols(map.symbols, effectiveLevel);
    lines.push(...symbolLines);
  }

  // Add footer with appropriate guidance
  lines.push("");
  lines.push(BOX_LINE);
  if (map.truncatedInfo) {
    // For truncated maps, provide specific guidance on finding omitted symbols
    const firstShown = map.symbols.slice(0, Math.floor(map.symbols.length / 2));
    const lastShown = map.symbols.slice(Math.floor(map.symbols.length / 2));
    const lastFirst = firstShown.at(-1);
    const firstLast = lastShown.at(0);
    if (lastFirst && firstLast) {
      const omitStart = lastFirst.endLine + 1;
      const omitEnd = firstLast.startLine - 1;
      lines.push(
        `Omitted symbols are in lines ${formatNumber(omitStart)}-${formatNumber(omitEnd)}.`
      );
    }
    lines.push(
      "Use read(path, offset=LINE, limit=N) to view specific sections."
    );
  } else {
    lines.push("Use read(path, offset=LINE, limit=N) for targeted reads.");
  }
  lines.push(BOX_LINE);

  return lines.join("\n");
}

/**
 * Get the appropriate detail level for a map based on size.
 */
export function getDetailLevelForSize(currentSize: number): DetailLevel {
  if (currentSize <= THRESHOLDS.FULL_TARGET_BYTES) {
    return DetailLevel.Full;
  }
  if (currentSize <= THRESHOLDS.COMPACT_TARGET_BYTES) {
    return DetailLevel.Compact;
  }
  if (currentSize <= THRESHOLDS.MAX_MAP_BYTES) {
    return DetailLevel.Minimal;
  }
  return DetailLevel.Outline;
}

/**
 * Reduce detail level of a file map.
 */
export function reduceToLevel(map: FileMap, level: DetailLevel): FileMap {
  if (level === DetailLevel.Outline) {
    // Remove all children and signatures
    return {
      ...map,
      detailLevel: DetailLevel.Outline,
      imports: [],
      symbols: map.symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        startLine: s.startLine,
        endLine: s.endLine,
      })),
    };
  }

  if (level === DetailLevel.Minimal) {
    // Remove signatures and docstrings but keep children flattened
    return {
      ...map,
      detailLevel: DetailLevel.Minimal,
      symbols: map.symbols.map((s) => ({
        name: s.name,
        kind: s.kind,
        startLine: s.startLine,
        endLine: s.endLine,
        isExported: s.isExported,
        children: s.children?.map((c) => ({
          name: c.name,
          kind: c.kind,
          startLine: c.startLine,
          endLine: c.endLine,
          isExported: c.isExported,
        })),
      })),
    };
  }

  if (level === DetailLevel.Compact) {
    // Remove signatures but keep structure
    return {
      ...map,
      detailLevel: DetailLevel.Compact,
      symbols: map.symbols.map((s) => stripSignatures(s)),
    };
  }

  return { ...map, detailLevel: DetailLevel.Full };
}

function stripSignatures(symbol: FileSymbol): FileSymbol {
  return {
    name: symbol.name,
    kind: symbol.kind,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    modifiers: symbol.modifiers,
    docstring: symbol.docstring,
    isExported: symbol.isExported,
    children: symbol.children?.map(stripSignatures),
  };
}

/**
 * Reduce a file map to truncated form: first N + last N symbols only.
 * Used when even Outline level exceeds budget.
 */
export function reduceToTruncated(
  map: FileMap,
  symbolsEach: number = THRESHOLDS.TRUNCATED_SYMBOLS_EACH
): FileMap {
  const { symbols } = map;
  const total = symbols.length;

  if (total <= symbolsEach * 2) {
    // Not enough symbols to truncate, return as outline
    return reduceToLevel(map, DetailLevel.Outline);
  }

  const firstSymbols = symbols.slice(0, symbolsEach).map((s) => ({
    name: s.name,
    kind: s.kind,
    startLine: s.startLine,
    endLine: s.endLine,
  }));

  const lastSymbols = symbols.slice(-symbolsEach).map((s) => ({
    name: s.name,
    kind: s.kind,
    startLine: s.startLine,
    endLine: s.endLine,
  }));

  return {
    ...map,
    symbols: [...firstSymbols, ...lastSymbols],
    detailLevel: DetailLevel.Truncated,
    imports: [],
    truncatedInfo: {
      totalSymbols: total,
      shownSymbols: symbolsEach * 2,
      omittedSymbols: total - symbolsEach * 2,
    },
  };
}

/**
 * Format a file map with automatic budget enforcement.
 * Reduces detail level until the map fits within the budget.
 */
export function formatFileMapWithBudget(
  map: FileMap,
  maxBytes = THRESHOLDS.MAX_TRUNCATED_BYTES
): string {
  // Tiered budgets: progressively reduce detail level
  const tiers: { level: DetailLevel; budget: number }[] = [
    { level: DetailLevel.Full, budget: THRESHOLDS.FULL_TARGET_BYTES },
    { level: DetailLevel.Compact, budget: THRESHOLDS.COMPACT_TARGET_BYTES },
    { level: DetailLevel.Minimal, budget: THRESHOLDS.MAX_MAP_BYTES },
    { level: DetailLevel.Outline, budget: THRESHOLDS.MAX_OUTLINE_BYTES },
  ];

  for (const { level, budget } of tiers) {
    const reduced = reduceToLevel(map, level);
    const formatted = formatFileMap(reduced, level);
    const size = Buffer.byteLength(formatted, "utf8");

    if (size <= budget && size <= maxBytes) {
      return formatted;
    }
  }

  // Outline exceeded budget - need to truncate symbols
  // First check if full outline fits in maxBytes (just not in outline budget)
  const outline = reduceToLevel(map, DetailLevel.Outline);
  const outlineFormatted = formatFileMap(outline, DetailLevel.Outline);
  const outlineSize = Buffer.byteLength(outlineFormatted, "utf8");

  if (outlineSize <= maxBytes) {
    // Outline fits in truncated budget, use it
    return outlineFormatted;
  }

  // Need to truncate - binary search for maximum symbols that fit
  const totalSymbols = map.symbols.length;
  const minSymbols = 10; // Guaranteed minimum
  const maxSymbolsEach = Math.floor(totalSymbols / 2); // Can't show more than half on each side

  let low = minSymbols;
  let high = maxSymbolsEach;
  let bestResult: string | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const truncated = reduceToTruncated(map, mid);
    const formatted = formatFileMap(truncated, DetailLevel.Truncated);
    const size = Buffer.byteLength(formatted, "utf8");

    if (size <= maxBytes) {
      // This fits, try to show more
      bestResult = formatted;
      low = mid + 1;
    } else {
      // Too big, show fewer
      high = mid - 1;
    }
  }

  // Return best result or fallback to minimum
  if (bestResult) {
    return bestResult;
  }

  // Absolute fallback: minimum symbols (guaranteed to fit)
  const minimal = reduceToTruncated(map, minSymbols);
  return formatFileMap(minimal, DetailLevel.Truncated);
}

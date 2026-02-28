import type { FileMap, FileSymbol } from "./types.js";
import type { SymbolKind } from "./enums.js";

export interface SymbolMatch {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
}

export type SymbolLookupResult =
  | { type: "found"; symbol: SymbolMatch }
  | { type: "ambiguous"; candidates: SymbolMatch[] }
  | { type: "not-found" };

function toMatch(symbol: FileSymbol): SymbolMatch {
  return {
    name: symbol.name,
    kind: symbol.kind,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
  };
}

export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  if (!query) return { type: "not-found" };
  if (map.symbols.length === 0) return { type: "not-found" };

  const first = map.symbols[0];
  if (first.name === query) {
    return { type: "found", symbol: toMatch(first) };
  }

  return { type: "not-found" };
}

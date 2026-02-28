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
  const exact = map.symbols.filter((s) => s.name === query);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };
  if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };

  if (query.includes(".")) {
    const [parentName, childName] = query.split(".", 2);
    const nested: FileSymbol[] = [];

    for (const top of map.symbols) {
      if (top.name !== parentName || !top.children?.length) continue;
      for (const child of top.children) {
        if (child.name === childName) nested.push(child);
      }
    }

    if (nested.length === 1) return { type: "found", symbol: toMatch(nested[0]) };
    if (nested.length > 1) return { type: "ambiguous", candidates: nested.map(toMatch) };
  }
  return { type: "not-found" };
}

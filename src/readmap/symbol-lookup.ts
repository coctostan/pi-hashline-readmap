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
  const q = query.trim();
  if (!q) return { type: "not-found" };
  if (map.symbols.length === 0) return { type: "not-found" };

  const exact = map.symbols.filter((s) => s.name === q);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };
  if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };

  if (q.includes(".")) {
    const [parentName, childName] = q.split(".", 2);
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

  const qLower = q.toLowerCase();

  const ci = map.symbols.filter((s) => s.name.toLowerCase() === qLower);
  if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0]) };
  if (ci.length > 1) return { type: "ambiguous", candidates: ci.map(toMatch) };

  const partial = map.symbols.filter((s) => s.name.toLowerCase().includes(qLower));
  if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
  if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };

  return { type: "not-found" };
}

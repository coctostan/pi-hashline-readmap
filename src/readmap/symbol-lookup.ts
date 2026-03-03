import type { FileMap, FileSymbol } from "./types.js";
import type { SymbolKind } from "./enums.js";

export interface SymbolMatch {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  parentName?: string;
}

export type SymbolLookupResult =
  | { type: "found"; symbol: SymbolMatch }
  | { type: "ambiguous"; candidates: SymbolMatch[] }
  | { type: "not-found" };

function toMatch(symbol: FileSymbol, parentName?: string): SymbolMatch {
  return {
    name: symbol.name,
    kind: symbol.kind,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    ...(parentName ? { parentName } : {}),
  };
}

interface SymbolCandidate {
  symbol: FileSymbol;
  parentName?: string;
}

function toMatches(candidates: SymbolCandidate[]): SymbolMatch[] {
  return candidates.map((candidate) => toMatch(candidate.symbol, candidate.parentName));
}

function flattenSymbols(symbols: FileSymbol[]): SymbolCandidate[] {
  const flattened: SymbolCandidate[] = [];

  const visit = (symbol: FileSymbol, parentName?: string): void => {
    flattened.push({ symbol, parentName });
    for (const child of symbol.children ?? []) {
      visit(child, symbol.name);
    }
  };

  for (const symbol of symbols) {
    visit(symbol);
  }

  return flattened;
}

function resolveDotPath(symbols: FileSymbol[], parts: string[]): SymbolCandidate[] {
  let candidates: SymbolCandidate[] = symbols
    .filter((symbol) => symbol.name === parts[0])
    .map((symbol) => ({ symbol }));

  for (let i = 1; i < parts.length; i++) {
    const nextCandidates: SymbolCandidate[] = [];

    for (const candidate of candidates) {
      for (const child of candidate.symbol.children ?? []) {
        if (child.name === parts[i]) {
          nextCandidates.push({ symbol: child, parentName: candidate.symbol.name });
        }
      }
    }

    candidates = nextCandidates;
  }

  return candidates;
}

export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  const q = query.trim();
  if (!q) return { type: "not-found" };
  if (map.symbols.length === 0) return { type: "not-found" };

  const allSymbols = flattenSymbols(map.symbols);

  if (q.includes("@")) {
    const parts = q.split("@");
    if (parts.length === 2 && parts[0] && /^\d+$/.test(parts[1])) {
      const [namePart, linePart] = parts;
      const lineNum = Number.parseInt(linePart, 10);
      const byLine = allSymbols.filter((c) => c.symbol.name === namePart && c.symbol.startLine === lineNum);
      if (byLine.length === 1) return { type: "found", symbol: toMatch(byLine[0].symbol, byLine[0].parentName) };
      if (byLine.length > 1) return { type: "ambiguous", candidates: toMatches(byLine.slice(0, 5)) };
    }
  }

  const exact = allSymbols.filter((c) => c.symbol.name === q);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0].symbol, exact[0].parentName) };
  if (exact.length > 1) return { type: "ambiguous", candidates: toMatches(exact.slice(0, 5)) };

  if (q.includes(".")) {
    const parts = q.split(".").map((p) => p.trim());
    if (parts.length >= 2 && parts.every((p) => p.length > 0)) {
      const candidates = resolveDotPath(map.symbols, parts);
      if (candidates.length === 1) {
        return { type: "found", symbol: toMatch(candidates[0].symbol, candidates[0].parentName) };
      }
      if (candidates.length > 1) {
        return {
          type: "ambiguous",
          candidates: toMatches(candidates.slice(0, 5)),
        };
      }
    }
  }

  const qLower = q.toLowerCase();

  // Tier 1: case-insensitive exact
  const ci = allSymbols.filter((c) => c.symbol.name.toLowerCase() === qLower);
  if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0].symbol, ci[0].parentName) };
  if (ci.length > 1) return { type: "ambiguous", candidates: toMatches(ci.slice(0, 5)) };

  // Tier 2: prefix match
  const prefix = allSymbols.filter((c) => c.symbol.name.toLowerCase().startsWith(qLower));
  if (prefix.length === 1) return { type: "found", symbol: toMatch(prefix[0].symbol, prefix[0].parentName) };
  if (prefix.length > 1) return { type: "ambiguous", candidates: toMatches(prefix.slice(0, 5)) };

  // Tier 3: camelCase word boundary match
  const camelCase = allSymbols.filter((c) => {
    const words = c.symbol.name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_]+/);
    return words.some((w) => w === qLower);
  });
  if (camelCase.length === 1) return { type: "found", symbol: toMatch(camelCase[0].symbol, camelCase[0].parentName) };
  if (camelCase.length > 1) return { type: "ambiguous", candidates: toMatches(camelCase.slice(0, 5)) };

  // Tier 4: substring match
  const partial = allSymbols.filter((c) => c.symbol.name.toLowerCase().includes(qLower));
  if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0].symbol, partial[0].parentName) };
  if (partial.length > 1) return { type: "ambiguous", candidates: toMatches(partial.slice(0, 5)) };

  return { type: "not-found" };
}

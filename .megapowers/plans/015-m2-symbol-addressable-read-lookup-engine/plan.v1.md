# Plan: Symbol-Addressable Read (M2)

## Overview

This plan implements symbol-addressable reading in 13 tasks. Tasks 1–10 build the pure symbol lookup engine (`src/readmap/symbol-lookup.ts`) with zero I/O dependencies. Tasks 11–12 wire the engine into the read tool (`src/read.ts`). Task 13 updates the prompt documentation.

**Test runner:** `npx vitest run`
**Single test:** `npx vitest run tests/<file>.test.ts`
**Typecheck:** `npx tsc --noEmit`

---

### Task 1: Exact symbol match [AC 1]

**Files:**
- Create: `src/readmap/symbol-lookup.ts`
- Create: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// tests/symbol-lookup.test.ts
import { describe, it, expect } from "vitest";
import { findSymbol } from "../src/readmap/symbol-lookup.js";
import type { FileMap } from "../src/readmap/types.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";

function makeMap(symbols: FileMap["symbols"]): FileMap {
  return {
    path: "/test/file.ts",
    totalLines: 100,
    totalBytes: 5000,
    language: "typescript",
    symbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  };
}

describe("symbol lookup — exact match", () => {
  it("returns a single match with correct name, kind, startLine, endLine for exact name", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 30 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 35, endLine: 50 },
    ]);

    const result = findSymbol(map, "parseConfig");

    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.name).toBe("parseConfig");
      expect(result.symbol.kind).toBe(SymbolKind.Function);
      expect(result.symbol.startLine).toBe(10);
      expect(result.symbol.endLine).toBe(30);
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: FAIL — Cannot find module `../src/readmap/symbol-lookup.js`

**Step 3 — Write minimal implementation**

```typescript
// src/readmap/symbol-lookup.ts
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

function toMatch(s: FileSymbol): SymbolMatch {
  return { name: s.name, kind: s.kind, startLine: s.startLine, endLine: s.endLine };
}

function flattenSymbols(symbols: FileSymbol[]): FileSymbol[] {
  const result: FileSymbol[] = [];
  for (const s of symbols) {
    result.push(s);
    if (s.children?.length) {
      result.push(...flattenSymbols(s.children));
    }
  }
  return result;
}

export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  if (!query || !map.symbols.length) {
    return { type: "not-found" };
  }

  const all = flattenSymbols(map.symbols);

  // Tier 1: Exact match
  const exact = all.filter((s) => s.name === query);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };
  if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };

  return { type: "not-found" };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 2: Dot-notation nested symbol match [depends: 1] [AC 2]

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-lookup.test.ts
describe("symbol lookup — dot-notation nested match", () => {
  it("matches a child symbol via ClassName.methodName", () => {
    const map = makeMap([
      {
        name: "UserDirectory",
        kind: SymbolKind.Class,
        startLine: 13,
        endLine: 38,
        children: [
          { name: "addUser", kind: SymbolKind.Method, startLine: 20, endLine: 33 },
          { name: "getUser", kind: SymbolKind.Method, startLine: 35, endLine: 37 },
        ],
      },
    ]);

    const result = findSymbol(map, "UserDirectory.addUser");

    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.name).toBe("addUser");
      expect(result.symbol.kind).toBe(SymbolKind.Method);
      expect(result.symbol.startLine).toBe(20);
      expect(result.symbol.endLine).toBe(33);
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: FAIL — `result.type` is `"not-found"` (dot-notation not implemented yet)

**Step 3 — Write minimal implementation**

In `findSymbol()` in `src/readmap/symbol-lookup.ts`, add dot-notation handling between exact match and return not-found:

```typescript
  // Tier 2: Dot-notation nested match (Parent.child)
  if (query.includes(".")) {
    const dotIndex = query.indexOf(".");
    const parentName = query.slice(0, dotIndex);
    const childName = query.slice(dotIndex + 1);
    const matches: FileSymbol[] = [];
    for (const s of all) {
      if (s.name === parentName && s.children?.length) {
        for (const child of s.children) {
          if (child.name === childName) {
            matches.push(child);
          }
        }
      }
    }
    if (matches.length === 1) return { type: "found", symbol: toMatch(matches[0]) };
    if (matches.length > 1) return { type: "ambiguous", candidates: matches.map(toMatch) };
  }
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 3: Case-insensitive fallback match [depends: 1] [AC 3]

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-lookup.test.ts
describe("symbol lookup — case-insensitive fallback", () => {
  it("falls back to case-insensitive when no exact match exists", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 30 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 35, endLine: 50 },
    ]);

    const result = findSymbol(map, "PARSECONFIG");

    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.name).toBe("parseConfig");
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: FAIL — `result.type` is `"not-found"`

**Step 3 — Write minimal implementation**

In `findSymbol()`, add after dot-notation tier:

```typescript
  // Tier 3: Case-insensitive match
  const queryLower = query.toLowerCase();
  const caseInsensitive = all.filter((s) => s.name.toLowerCase() === queryLower);
  if (caseInsensitive.length === 1) return { type: "found", symbol: toMatch(caseInsensitive[0]) };
  if (caseInsensitive.length > 1) return { type: "ambiguous", candidates: caseInsensitive.map(toMatch) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 4: Unique partial substring match [depends: 3] [AC 4]

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-lookup.test.ts
describe("symbol lookup — partial match", () => {
  it("returns a single match when exactly one symbol contains the substring", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 30 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 35, endLine: 50 },
      { name: "validateInput", kind: SymbolKind.Function, startLine: 55, endLine: 70 },
    ]);

    const result = findSymbol(map, "Config");

    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.name).toBe("parseConfig");
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: FAIL — `result.type` is `"not-found"`

**Step 3 — Write minimal implementation**

In `findSymbol()`, add after case-insensitive tier:

```typescript
  // Tier 4: Partial substring match (case-insensitive)
  const partial = all.filter((s) => s.name.toLowerCase().includes(queryLower));
  if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
  if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 5: Ambiguous partial match returns candidates [depends: 4] [AC 5]

**Files:**
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to "symbol lookup — partial match" describe block
  it("returns ambiguous with candidate list when multiple symbols match substring", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 30 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 35, endLine: 50 },
      { name: "parseInput", kind: SymbolKind.Function, startLine: 55, endLine: 70 },
    ]);

    const result = findSymbol(map, "parse");

    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map((c) => c.name)).toContain("parseConfig");
      expect(result.candidates.map((c) => c.name)).toContain("parseInput");
    }
  });
```

**Step 2 — Run test, verify it passes immediately**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS — the implementation from Task 4 already handles this case (partial match with `length > 1` returns ambiguous)

**Step 3 — No additional implementation needed**

This test validates existing behavior from Task 4. The `partial.length > 1` branch already returns ambiguous results.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 6: Priority cascade — exact shadows lower tiers [depends: 4] [AC 6]

**Files:**
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-lookup.test.ts
describe("symbol lookup — priority cascade", () => {
  it("exact match shadows case-insensitive and partial matches", () => {
    const map = makeMap([
      { name: "Config", kind: SymbolKind.Interface, startLine: 1, endLine: 10 },
      { name: "config", kind: SymbolKind.Variable, startLine: 12, endLine: 12 },
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 15, endLine: 30 },
    ]);

    // "Config" exact-matches the interface — ignores the variable (case-insensitive) and function (partial)
    const result = findSymbol(map, "Config");

    expect(result.type).toBe("found");
    if (result.type === "found") {
      expect(result.symbol.name).toBe("Config");
      expect(result.symbol.kind).toBe(SymbolKind.Interface);
    }
  });
});
```

**Step 2 — Run test, verify it passes immediately**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS — the cascade logic (exact → dot → case-insensitive → partial) already returns at the first tier that has results.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 7: Not-found, empty query, and empty symbols [depends: 1] [AC 7, 8, 9]

**Files:**
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-lookup.test.ts
describe("symbol lookup — edge cases", () => {
  it("returns not-found when no symbol matches", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 30 },
    ]);
    const result = findSymbol(map, "doesNotExist");
    expect(result.type).toBe("not-found");
  });

  it("returns not-found for empty query string", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 30 },
    ]);
    const result = findSymbol(map, "");
    expect(result.type).toBe("not-found");
  });

  it("returns not-found when symbols array is empty", () => {
    const map = makeMap([]);
    const result = findSymbol(map, "anything");
    expect(result.type).toBe("not-found");
  });
});
```

**Step 2 — Run test, verify it passes immediately**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS — the guard clause and cascade all return `not-found` when nothing matches.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 8: Multiple exact matches yield ambiguous [depends: 1] [AC 10]

**Files:**
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to "symbol lookup — exact match" describe block
  it("returns ambiguous when multiple symbols share the exact same name", () => {
    const map = makeMap([
      { name: "initialize", kind: SymbolKind.Method, startLine: 10, endLine: 50 },
      { name: "initialize", kind: SymbolKind.Method, startLine: 100, endLine: 140 },
    ]);

    const result = findSymbol(map, "initialize");

    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].startLine).toBe(10);
      expect(result.candidates[1].startLine).toBe(100);
    }
  });
```

**Step 2 — Run test, verify it passes immediately**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS — the exact match branch already handles `exact.length > 1` as ambiguous.

**Step 3 — No additional implementation needed**

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 9: Read tool schema accepts symbol parameter and rejects symbol+offset/limit [depends: 1] [AC 11, 12]

**Files:**
- Modify: `src/read.ts`
- Create: `tests/symbol-read.test.ts`

**Step 1 — Write the failing test**

```typescript
// tests/symbol-read.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clearMapCache } from "../src/map-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

type ReadParams = {
  path: string;
  offset?: number;
  limit?: number;
  symbol?: string;
};

async function callReadTool(params: ReadParams) {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = {
    registerTool(def: any) {
      capturedTool = def;
    },
  };
  registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");

  // Verify the schema includes the symbol parameter
  const schemaProps = capturedTool.parameters.properties;
  if (!schemaProps.symbol) throw new Error("symbol parameter not in schema");

  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("symbol read — parameter validation", () => {
  beforeEach(() => clearMapCache());

  it("read tool schema includes optional symbol parameter", async () => {
    const { registerReadTool } = await import("../src/read.js");
    let capturedTool: any = null;
    const mockPi = { registerTool(def: any) { capturedTool = def; } };
    registerReadTool(mockPi as any);
    expect(capturedTool.parameters.properties.symbol).toBeDefined();
  });

  it("returns error when symbol is combined with offset", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "UserDirectory",
      offset: 5,
    });
    const text = getTextContent(result);
    expect(result.isError).toBe(true);
    expect(text).toContain("Cannot combine symbol with offset/limit");
  });

  it("returns error when symbol is combined with limit", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "UserDirectory",
      limit: 10,
    });
    const text = getTextContent(result);
    expect(result.isError).toBe(true);
    expect(text).toContain("Cannot combine symbol with offset/limit");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: FAIL — schema doesn't have `symbol` property; no validation logic for symbol+offset/limit

**Step 3 — Write minimal implementation**

In `src/read.ts`, add the `symbol` parameter to the schema and add validation at the top of the execute function:

Add to imports:
```typescript
// (no new imports needed yet)
```

Add `symbol` to the parameters schema (after the `limit` line):
```typescript
symbol: Type.Optional(Type.String({ description: "Symbol name to read (e.g., 'functionName' or 'ClassName.methodName')" })),
```

Add validation early in `execute()`, after the `rawPath` and `absolutePath` lines (before the access check):
```typescript
// Symbol + offset/limit conflict check
if (params.symbol && (params.offset !== undefined || params.limit !== undefined)) {
  return {
    content: [{ type: "text", text: "Cannot combine symbol with offset/limit. Use one or the other." }],
    isError: true,
    details: {},
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 10: Symbol read returns targeted hashlined content with header [depends: 9, 4] [AC 13, 14, 15]

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-read.test.ts

function parseHashlineRows(text: string) {
  const rows: { line: number; hash: string; anchor: string; content: string }[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\d+):([0-9a-f]{2})\|(.*)$/);
    if (!match) continue;
    rows.push({
      line: Number(match[1]),
      hash: match[2],
      anchor: `${match[1]}:${match[2]}`,
      content: match[3],
    });
  }
  return rows;
}

describe("symbol read — single match", () => {
  beforeEach(() => clearMapCache());

  it("returns hashlined content for only the matched symbol's line range with header", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
    });
    const text = getTextContent(result);

    // Should have header with symbol info
    expect(text).toMatch(/\[Symbol: createDemoDirectory \(function\), lines \d+-\d+ of \d+\]/);

    // Should have hashlines
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);

    // All line numbers should be within the symbol's range
    // createDemoDirectory starts at line 45 in small.ts
    expect(rows[0].line).toBeGreaterThanOrEqual(40); // approximate — the function is near end of file

    // Should contain the function content
    expect(text).toContain("createDemoDirectory");

    // Should NOT contain structural map
    expect(text).not.toContain("File Map:");
  });

  it("does not include structural map appendix on symbol reads", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "parseConfig",
    });
    const text = getTextContent(result);

    expect(text).toMatch(/\[Symbol: parseConfig \(function\)/);
    expect(text).not.toContain("File Map:");

    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
    // parseConfig is at line 10437-10459 in large.ts — far fewer lines than total
    expect(rows.length).toBeLessThan(100);
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: FAIL — symbol parameter is accepted but no symbol lookup/targeting logic exists yet

**Step 3 — Write minimal implementation**

Add imports to `src/read.ts`:
```typescript
import { findSymbol } from "./readmap/symbol-lookup.js";
```

In the `execute()` function of `src/read.ts`, add a symbol handling branch after the file content is read and normalized (after `const allLines = normalized.split("\n")` and `const total = allLines.length`), but **before** the existing offset/limit logic:

```typescript
// Symbol-addressed read
if (params.symbol) {
  let fileMap: FileMap | null = null;
  try {
    fileMap = await getOrGenerateMap(absolutePath);
  } catch {
    // Map generation failed
  }

  if (!fileMap) {
    // Unmappable file — fallback to normal read with warning
    const ext = rawPath.split(".").pop() ?? "";
    const warning = `[Warning: symbol lookup not available for .${ext} files — showing full file]\n\n`;
    // Fall through to normal read below, prepending warning
    const startLine = 1;
    const endIdx = total;
    const selected = allLines.slice(startLine - 1, endIdx);
    const formatted = selected
      .map((line, i) => {
        const num = startLine + i;
        return `${num}:${computeLineHash(num, line)}|${line}`;
      })
      .join("\n");
    const truncation = truncateHead(formatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
    let text = warning + truncation.content;
    if (truncation.truncated) {
      text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${total} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${startLine + truncation.outputLines} to continue.]`;
    }
    return {
      content: [{ type: "text", text }],
      details: { truncation: truncation.truncated ? truncation : undefined },
    };
  }

  const lookupResult = findSymbol(fileMap, params.symbol);

  if (lookupResult.type === "found") {
    const { symbol } = lookupResult;
    const symStart = symbol.startLine;
    const symEnd = symbol.endLine;
    const selected = allLines.slice(symStart - 1, symEnd);
    const formatted = selected
      .map((line, i) => {
        const num = symStart + i;
        return `${num}:${computeLineHash(num, line)}|${line}`;
      })
      .join("\n");
    const header = `[Symbol: ${symbol.name} (${symbol.kind}), lines ${symStart}-${symEnd} of ${total}]`;
    return {
      content: [{ type: "text", text: `${header}\n\n${formatted}` }],
      details: {},
    };
  }

  if (lookupResult.type === "ambiguous") {
    const lines = lookupResult.candidates.map(
      (c) => `  - ${c.name} (${c.kind}), lines ${c.startLine}-${c.endLine}`
    );
    const text = `Multiple symbols match '${params.symbol}':\n${lines.join("\n")}\n\nUse a more specific name or dot notation (e.g., ClassName.methodName).`;
    return {
      content: [{ type: "text", text }],
      details: {},
    };
  }

  // not-found: fallback to normal read with warning listing available symbols
  const topSymbols = fileMap.symbols.slice(0, 20).map((s) => s.name);
  const warning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${topSymbols.join(", ")}]\n\n`;
  // Fall through to a normal read with warning prepended
  const startLine = 1;
  const endIdx = total;
  const selected = allLines.slice(startLine - 1, endIdx);
  const formatted = selected
    .map((line, i) => {
      const num = startLine + i;
      return `${num}:${computeLineHash(num, line)}|${line}`;
    })
    .join("\n");
  const truncation = truncateHead(formatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  let text = warning + truncation.content;
  if (truncation.truncated) {
    text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${total} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${startLine + truncation.outputLines} to continue.]`;
  }
  return {
    content: [{ type: "text", text }],
    details: { truncation: truncation.truncated ? truncation : undefined },
  };
}
```

Also add the import for FileMap type at the top of `src/read.ts`:
```typescript
import type { FileMap } from "./readmap/types.js";
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 11: Ambiguous match returns disambiguation message; not-found falls back with warning [depends: 10] [AC 16, 17]

**Files:**
- Modify: `tests/symbol-read.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-read.test.ts
describe("symbol read — ambiguous and not-found", () => {
  beforeEach(() => clearMapCache());

  it("returns disambiguation message when multiple symbols match", async () => {
    // "initialize" appears as a method in multiple classes in large.ts
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "initialize",
    });
    const text = getTextContent(result);

    expect(text).toContain("Multiple symbols match");
    expect(text).toContain("initialize");
    // Should not contain hashlined content
    const rows = parseHashlineRows(text);
    expect(rows.length).toBe(0);
  });

  it("falls back to normal read with warning when symbol not found", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "nonExistentSymbol",
    });
    const text = getTextContent(result);

    expect(result.isError).not.toBe(true);
    expect(text).toContain("[Warning: symbol 'nonExistentSymbol' not found. Available symbols:");
    // Should contain actual symbol names from the file
    expect(text).toContain("UserDirectory");
    // Should still include hashlined content
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("warning lists up to 20 top-level symbol names", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "zzzzNotASymbol",
    });
    const text = getTextContent(result);

    expect(text).toContain("[Warning: symbol 'zzzzNotASymbol' not found. Available symbols:");
    // Should have hashlined content after warning
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

**Step 2 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: PASS — Task 10 already implemented disambiguation and not-found fallback logic.

If the "initialize" test doesn't find ambiguous results (depends on whether large.ts has `initialize` as a flattened child in multiple classes), adjust the test symbol. The `initialize` method exists in EventEmitter (line 62) and likely in other classes too since they follow the same pattern.

**Step 3 — No additional implementation needed** (if tests pass). If the ambiguous test fails because `initialize` only appears once after flattening, update the test to use a symbol that genuinely appears multiple times, or test with a synthetic approach.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 12: Unmappable file fallback and symbol reads on small vs large files [depends: 10] [AC 18, 19, 20]

**Files:**
- Modify: `tests/symbol-read.test.ts`

**Step 1 — Write the failing test**

```typescript
// Add to tests/symbol-read.test.ts
import { readFileSync } from "node:fs";

describe("symbol read — fallback and edge cases", () => {
  beforeEach(() => clearMapCache());

  it("falls back with warning when file cannot be mapped (plain text)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "plain.txt"),
      symbol: "anything",
    });
    const text = getTextContent(result);

    expect(result.isError).not.toBe(true);
    expect(text).toContain("[Warning: symbol lookup not available for .txt files");
    // Should still show file content
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("symbol reads work on small files (under truncation threshold)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "UserDirectory",
    });
    const text = getTextContent(result);

    expect(text).toMatch(/\[Symbol: UserDirectory \(class\)/);
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
    // UserDirectory spans roughly lines 13-38
    expect(rows[0].line).toBeGreaterThanOrEqual(13);
  });

  it("symbol reads work on large files (over truncation threshold)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "EventEmitter",
    });
    const text = getTextContent(result);

    expect(text).toMatch(/\[Symbol: EventEmitter \(class\)/);
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
    // EventEmitter starts at line 47
    expect(rows[0].line).toBe(47);
  });

  it("hash anchors from symbol read are valid for edit tool", async () => {
    const { applyHashlineEdits } = await import("../src/hashline.js");
    const smallPath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({
      path: smallPath,
      symbol: "createDemoDirectory",
    });
    const text = getTextContent(result);
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);

    const anchor = rows[0].anchor;
    const originalContent = readFileSync(smallPath, "utf-8");

    let editResult: { content: string; firstChangedLine: number | undefined } | undefined;
    expect(() => {
      editResult = applyHashlineEdits(originalContent, [
        { set_line: { anchor, new_text: "// symbol edit test" } },
      ]);
    }).not.toThrow();

    expect(editResult?.content).toContain("// symbol edit test");
    expect(editResult?.firstChangedLine).toBe(rows[0].line);
  });
});
```

**Step 2 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: PASS — all these behaviors are covered by the implementation in Task 10. The unmappable file case may need adjustment depending on whether `getOrGenerateMap` returns null for `.txt` files (it should, since the fallback mapper may produce an empty map rather than null).

If the unmappable test fails because `getOrGenerateMap` returns a map with zero symbols (rather than null), the not-found path handles it — the warning would say "symbol not found" instead of "symbol lookup not available". In that case, adjust the test expectation to check for the not-found warning pattern instead, or add a check in the symbol branch: if `fileMap.symbols.length === 0`, treat as unmappable.

**Step 3 — Possible adjustment to `src/read.ts`**

If `getOrGenerateMap` returns a FileMap with empty symbols for plain text files, add a check after getting the map:

```typescript
if (!fileMap || fileMap.symbols.length === 0) {
```

instead of just:

```typescript
if (!fileMap) {
```

This ensures files that can be parsed but have no symbols still get the "not available" warning.

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npx vitest run`
Expected: all passing

---

### Task 13: Update prompts/read.md with symbol documentation [no-test] [AC 21]

**Justification:** This is a documentation-only change to a prompt file. Prompt content isn't testable with unit tests — it's a markdown file read as a string for the tool description.

**Files:**
- Modify: `prompts/read.md`

**Step 1 — Make the change**

Append to `prompts/read.md`:

```markdown

## Symbol Parameter

Use `symbol` to read a specific symbol (function, class, method, etc.) without knowing its line number:

- `read("file.ts", { symbol: "functionName" })` — reads just that function
- `read("file.ts", { symbol: "ClassName.methodName" })` — reads a method inside a class using dot notation
- `read("file.ts", { symbol: "ClassName" })` — reads the entire class

**Matching priority:** exact name → dot-notation nested → case-insensitive → unique substring.

**Mutual exclusivity:** `symbol` cannot be combined with `offset` or `limit`. Use one addressing mode or the other.

**When symbol is not found:** falls back to a normal read with a warning listing available symbol names.

**When multiple symbols match:** returns a disambiguation list — refine with a more specific name or use dot notation.
```

**Step 2 — Verify**
Run: `npx tsc --noEmit`
Expected: Success (no type errors — the prompt is loaded via `readFileSync` at runtime)

Run: `npx vitest run`
Expected: all passing

---

## AC Coverage Matrix

| AC | Task(s) | Description |
|----|---------|-------------|
| 1 | Task 1 | Exact match returns single match with name/kind/startLine/endLine |
| 2 | Task 2 | Dot-notation nested match |
| 3 | Task 3 | Case-insensitive fallback |
| 4 | Task 4 | Unique partial substring match |
| 5 | Task 5 | Ambiguous partial match returns candidates |
| 6 | Task 6 | Priority cascade — highest tier only |
| 7 | Task 7 | Not-found result |
| 8 | Task 7 | Empty query guard |
| 9 | Task 7 | Empty symbols array |
| 10 | Task 8 | Multiple exact matches → ambiguous |
| 11 | Task 9 | Schema accepts optional symbol parameter |
| 12 | Task 9 | symbol + offset/limit → error |
| 13 | Task 10 | Single match → targeted hashlined content |
| 14 | Task 10 | Header format `[Symbol: name (kind), lines X-Y of Z]` |
| 15 | Task 10 | No structural map appendix on symbol reads |
| 16 | Task 11 | Ambiguous → disambiguation message, no content |
| 17 | Task 11 | Not found → normal read + warning + available symbols |
| 18 | Task 12 | Unmappable file → fallback with warning |
| 19 | Task 12 | Works on small and large files |
| 20 | Task 12 | Hash anchors valid for edit tool |
| 21 | Task 13 | prompts/read.md documents symbol parameter |

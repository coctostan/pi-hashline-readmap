# Plan: Symbol-Addressable Read (M2)

## Design Decisions

**Ambiguity handling:** Per spec AC 5 and AC 10, when multiple symbols match at the same priority tier, the result is **ambiguous** — returns all candidates. Source Issue #008's "prefer largest span" is superseded by the spec. No largest-span preference logic.

**Matching priority cascade:** exact → dot-notation → case-insensitive → partial substring. Higher tiers shadow lower. Each tier returns ambiguous for multi-match.

**Fallback design:** When symbol is not found or file is unmappable, the tool sets a warning string then **falls through to the existing normal read code path** (including structural map appending on truncation when appropriate). This avoids duplicating read logic and satisfies Review Point 3.

## Project Conventions

- **Language:** TypeScript (ESM, `.js` import specifiers)
- **Test framework:** Vitest
- **Run single test:** `npx vitest run tests/<file>.test.ts`
- **Run full suite:** `npm test`
- **Type check:** `npm run typecheck`

## Fixture Reference (exact values from map generation)

**`tests/fixtures/small.ts`** — 49 total lines, no trailing newline
- `createDemoDirectory` (function) L45-49
- `UserDirectory` (class) L13-38 — children: `constructor` L16, `addUser` L20-33, `getUser` L35-37
- `UserRecord` (interface) L6-11

**`tests/fixtures/large.ts`** — 10681 total lines, trailing newline
- `parseConfig` (function) L10437-10459
- `EventEmitter` (class) L47-1342 — child `initialize` (method) L62-146
- `TaskRunner` (class) L1346-2641 — child `initialize` (method) L1361-1445
- `DataProcessor` (class) L2645-3940 — child `initialize` (method) L2660-2744
- `CacheManager` (class) L3944-5239 — child `initialize` (method) L3959-4043
- `HttpClient` (class) L5243-6538 — child `initialize` (method) L5258-5342
- `DatabaseConnection` (class) L6542-7837 — child `initialize` (method) L6557-6641
- `MessageQueue` (class) L7841-9136 — child `initialize` (method) L7856-7940
- `FileWatcher` (class) L9140-10435 — child `initialize` (method) L9155-9239
- Plus 10 standalone functions: `formatOutput`, `validateInput`, `hashContent`, etc.

**`tests/fixtures/plain.txt`** — 23 lines, plain text, no code symbols

---

### Task 1: findSymbol — types, exact single match, and edge cases

**Covers:** AC 1, 7, 8, 9

**Files:**
- Create: `src/readmap/symbol-lookup.ts`
- Create: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```typescript
// tests/symbol-lookup.test.ts
import { describe, it, expect } from "vitest";
import { findSymbol } from "../src/readmap/symbol-lookup.js";
import type { FileMap } from "../src/readmap/types.js";
import { SymbolKind, DetailLevel } from "../src/readmap/enums.js";

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

describe("findSymbol — exact match and edge cases", () => {
  it("returns found with correct fields for a single exact match (AC 1)", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 45 },
    ]);
    const result = findSymbol(map, "parseConfig");
    expect(result).toEqual({
      type: "found",
      symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
    });
  });

  it("returns not-found for empty query (AC 8)", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
    ]);
    expect(findSymbol(map, "")).toEqual({ type: "not-found" });
  });

  it("returns not-found for whitespace-only query (AC 8)", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
    ]);
    expect(findSymbol(map, "   ")).toEqual({ type: "not-found" });
  });

  it("returns not-found when no symbol matches (AC 7)", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
    ]);
    expect(findSymbol(map, "doesNotExist")).toEqual({ type: "not-found" });
  });

  it("returns not-found when symbols array is empty (AC 9)", () => {
    const map = makeMap([]);
    expect(findSymbol(map, "anything")).toEqual({ type: "not-found" });
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `Cannot find module '../src/readmap/symbol-lookup.js'` (file does not exist yet)

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
    if (s.children) {
      result.push(...flattenSymbols(s.children));
    }
  }
  return result;
}

export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  const q = query.trim();
  if (!q) return { type: "not-found" };
  if (!map.symbols.length) return { type: "not-found" };

  const all = flattenSymbols(map.symbols);

  // Tier 1: Exact match
  const exact = all.filter(s => s.name === q);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };

  return { type: "not-found" };
}
```

Note: multiple exact matches (`exact.length > 1`) intentionally falls through to not-found. Task 5 will add ambiguous handling for this case.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS — all 5 tests pass

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 2: findSymbol — dot-notation nested match [depends: 1]

**Covers:** AC 2

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```typescript
describe("findSymbol — dot-notation nested match", () => {
  it("matches child symbol inside parent via dot notation (AC 2)", () => {
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
    expect(result).toEqual({
      type: "found",
      symbol: { name: "addUser", kind: "method", startLine: 20, endLine: 33 },
    });
  });

  it("returns not-found when parent exists but child does not", () => {
    const map = makeMap([
      {
        name: "UserDirectory",
        kind: SymbolKind.Class,
        startLine: 13,
        endLine: 38,
        children: [
          { name: "addUser", kind: SymbolKind.Method, startLine: 20, endLine: 33 },
        ],
      },
    ]);
    const result = findSymbol(map, "UserDirectory.removeUser");
    expect(result).toEqual({ type: "not-found" });
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `"UserDirectory.addUser"` has no exact match in the flattened list (no symbol named literally `"UserDirectory.addUser"`), so it returns `{ type: "not-found" }` instead of the expected found result.

**Step 3 — Write minimal implementation**

In `src/readmap/symbol-lookup.ts`, add Tier 2 between the exact match check and the final `return { type: "not-found" }`:

```typescript
export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  const q = query.trim();
  if (!q) return { type: "not-found" };
  if (!map.symbols.length) return { type: "not-found" };

  const all = flattenSymbols(map.symbols);

  // Tier 1: Exact match
  const exact = all.filter(s => s.name === q);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };

  // Tier 2: Dot-notation nested match
  if (q.includes(".")) {
    const dotIdx = q.indexOf(".");
    const parentName = q.slice(0, dotIdx);
    const childName = q.slice(dotIdx + 1);
    for (const s of map.symbols) {
      if (s.name === parentName && s.children) {
        const child = s.children.find(c => c.name === childName);
        if (child) return { type: "found", symbol: toMatch(child) };
      }
    }
  }

  return { type: "not-found" };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 3: findSymbol — case-insensitive fallback [depends: 1]

**Covers:** AC 3

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```typescript
describe("findSymbol — case-insensitive fallback", () => {
  it("falls back to case-insensitive when no exact match exists (AC 3)", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 45 },
    ]);
    const result = findSymbol(map, "PARSECONFIG");
    expect(result).toEqual({
      type: "found",
      symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
    });
  });

  it("exact match takes priority over case-insensitive match (AC 6)", () => {
    const map = makeMap([
      { name: "Config", kind: SymbolKind.Class, startLine: 1, endLine: 20 },
      { name: "config", kind: SymbolKind.Variable, startLine: 25, endLine: 25 },
    ]);
    // "config" exactly matches the variable, not the class (even though both match case-insensitively)
    const result = findSymbol(map, "config");
    expect(result).toEqual({
      type: "found",
      symbol: { name: "config", kind: "variable", startLine: 25, endLine: 25 },
    });
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `"PARSECONFIG"` has no exact match, returns `{ type: "not-found" }` instead of the expected found result.

**Step 3 — Write minimal implementation**

In `src/readmap/symbol-lookup.ts`, add Tier 3 after the dot-notation block:

```typescript
  // Tier 3: Case-insensitive match
  const qLower = q.toLowerCase();
  const ci = all.filter(s => s.name.toLowerCase() === qLower);
  if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0]) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 4: findSymbol — unique partial substring match [depends: 3]

**Covers:** AC 4

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```typescript
describe("findSymbol — partial substring match", () => {
  it("returns a match when exactly one symbol name contains the substring (AC 4)", () => {
    const map = makeMap([
      { name: "createDemoDirectory", kind: SymbolKind.Function, startLine: 45, endLine: 49 },
      { name: "UserDirectory", kind: SymbolKind.Class, startLine: 13, endLine: 38 },
      { name: "UserRecord", kind: SymbolKind.Interface, startLine: 6, endLine: 11 },
    ]);
    // "createDemo" is a substring of only "createDemoDirectory"
    const result = findSymbol(map, "createDemo");
    expect(result).toEqual({
      type: "found",
      symbol: { name: "createDemoDirectory", kind: "function", startLine: 45, endLine: 49 },
    });
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `"createDemo"` has no exact or case-insensitive match, returns `{ type: "not-found" }` instead of the expected found result.

**Step 3 — Write minimal implementation**

In `src/readmap/symbol-lookup.ts`, add Tier 4 after the case-insensitive block:

```typescript
  // Tier 4: Partial substring match
  const partial = all.filter(s => s.name.toLowerCase().includes(qLower));
  if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
```

Note: `partial.length > 1` intentionally falls through to not-found. Task 7 will add ambiguous handling.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 5: findSymbol — multiple exact matches → ambiguous [depends: 1]

**Covers:** AC 10, AC 6 (priority cascade)

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```typescript
describe("findSymbol — multi-match ambiguity", () => {
  it("returns ambiguous when multiple symbols have the same exact name (AC 10)", () => {
    const map = makeMap([
      {
        name: "Container",
        kind: SymbolKind.Class,
        startLine: 1,
        endLine: 50,
        children: [
          { name: "init", kind: SymbolKind.Method, startLine: 5, endLine: 20 },
        ],
      },
      {
        name: "Service",
        kind: SymbolKind.Class,
        startLine: 55,
        endLine: 100,
        children: [
          { name: "init", kind: SymbolKind.Method, startLine: 60, endLine: 80 },
        ],
      },
      // "initialize" partially contains "init" but is NOT an exact match
      { name: "initialize", kind: SymbolKind.Function, startLine: 105, endLine: 120 },
    ]);
    const result = findSymbol(map, "init");
    // Exact tier should catch "init" with 2 candidates — NOT 3 from partial tier (AC 6 cascade)
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates).toEqual([
        { name: "init", kind: "method", startLine: 5, endLine: 20 },
        { name: "init", kind: "method", startLine: 60, endLine: 80 },
      ]);
    }
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `exact.length > 1` currently falls through to not-found. The partial tier (Task 4) also doesn't handle `partial.length > 1`, so the result is `{ type: "not-found" }` instead of ambiguous.

**Step 3 — Write minimal implementation**

In `src/readmap/symbol-lookup.ts`, add after `if (exact.length === 1)`:

```typescript
  if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS — exact tier catches the 2 `"init"` matches before partial tier sees them.

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 6: findSymbol — multiple case-insensitive matches → ambiguous [depends: 3]

**Covers:** AC 10 (case-insensitive tier)

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to the `"findSymbol — multi-match ambiguity"` describe block in `tests/symbol-lookup.test.ts`:

```typescript
  it("returns ambiguous when multiple symbols match case-insensitively (AC 10)", () => {
    const map = makeMap([
      { name: "Config", kind: SymbolKind.Interface, startLine: 1, endLine: 10 },
      { name: "CONFIG", kind: SymbolKind.Constant, startLine: 15, endLine: 15 },
    ]);
    // No exact match for "config", but two case-insensitive matches
    const result = findSymbol(map, "config");
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates).toEqual([
        { name: "Config", kind: "interface", startLine: 1, endLine: 10 },
        { name: "CONFIG", kind: "constant", startLine: 15, endLine: 15 },
      ]);
    }
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `ci.length > 1` currently falls through to partial tier; partial also finds 2 matches but doesn't handle `> 1`, so result is `{ type: "not-found" }`.

**Step 3 — Write minimal implementation**

In `src/readmap/symbol-lookup.ts`, add after `if (ci.length === 1)`:

```typescript
  if (ci.length > 1) return { type: "ambiguous", candidates: ci.map(toMatch) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 7: findSymbol — multiple partial matches → ambiguous [depends: 4]

**Covers:** AC 5

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to the `"findSymbol — multi-match ambiguity"` describe block in `tests/symbol-lookup.test.ts`:

```typescript
  it("returns ambiguous when multiple symbol names contain the substring (AC 5)", () => {
    const map = makeMap([
      { name: "processData", kind: SymbolKind.Function, startLine: 1, endLine: 10 },
      { name: "processInput", kind: SymbolKind.Function, startLine: 15, endLine: 25 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
    ]);
    // "process" partially matches "processData" and "processInput" but not "formatOutput"
    const result = findSymbol(map, "process");
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates).toEqual([
        { name: "processData", kind: "function", startLine: 1, endLine: 10 },
        { name: "processInput", kind: "function", startLine: 15, endLine: 25 },
      ]);
    }
  });
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: FAIL — `partial.length > 1` currently falls through to not-found, returns `{ type: "not-found" }` instead of ambiguous.

**Step 3 — Write minimal implementation**

In `src/readmap/symbol-lookup.ts`, add after `if (partial.length === 1)`:

```typescript
  if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 8: Read tool schema — symbol parameter and offset/limit conflict [depends: 7]

**Covers:** AC 11, AC 12

**Files:**
- Modify: `src/read.ts`
- Create: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

```typescript
// tests/symbol-read-integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
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

type HashlineRow = {
  line: number;
  hash: string;
  anchor: string;
  content: string;
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
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

function parseHashlineRows(text: string): HashlineRow[] {
  const rows: HashlineRow[] = [];
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

describe("symbol read — param validation", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("rejects symbol combined with offset (AC 12)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
      offset: 10,
    });
    const text = getTextContent(result);
    expect(result.isError).toBe(true);
    expect(text).toBe("Cannot combine symbol with offset/limit. Use one or the other.");
  });

  it("rejects symbol combined with limit (AC 12)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
      limit: 10,
    });
    const text = getTextContent(result);
    expect(result.isError).toBe(true);
    expect(text).toBe("Cannot combine symbol with offset/limit. Use one or the other.");
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: FAIL — `params.symbol` is ignored by current read tool. When combined with `offset`, the read tool returns normal hashlined content (not an error). The `isError` assertion fails because the result has no `isError: true`.

**Step 3 — Write minimal implementation**

In `src/read.ts`, add `symbol` to the schema and add a validation check at the top of `execute()`:

1. Add to the schema parameters:
```typescript
parameters: Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
  symbol: Type.Optional(Type.String({ description: "Symbol name to read (e.g., 'functionName' or 'ClassName.methodName')" })),
}),
```

2. Add validation early in `execute()`, right after the `throwIfAborted(signal)` call on line 40 (before the file access check):
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

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 9: Symbol found → targeted read with header [depends: 1, 8]

**Covers:** AC 13, AC 14, AC 15, AC 19, AC 20

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```typescript
describe("symbol read — found symbol", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("returns targeted hashlined content with header for small file (AC 13, 14, 15, 19)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "createDemoDirectory",
    });
    const text = getTextContent(result);

    // AC 14: Header with exact line ranges
    expect(text).toContain("[Symbol: createDemoDirectory (function), lines 45-49 of 49]");

    // AC 13: Only the symbol's lines
    const rows = parseHashlineRows(text);
    expect(rows).toHaveLength(5);
    expect(rows[0].line).toBe(45);
    expect(rows[rows.length - 1].line).toBe(49);

    // AC 15: No structural map appended
    expect(text).not.toContain("File Map:");

    // Not an error
    expect(result.isError).not.toBe(true);
  });

  it("returns targeted hashlined content for large file (AC 19)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "parseConfig",
    });
    const text = getTextContent(result);

    // Exact header with line range from fixture map
    expect(text).toContain("[Symbol: parseConfig (function), lines 10437-10459 of 10681]");

    const rows = parseHashlineRows(text);
    expect(rows).toHaveLength(23);
    expect(rows[0].line).toBe(10437);
    expect(rows[rows.length - 1].line).toBe(10459);

    // No map appended
    expect(text).not.toContain("File Map:");
  });

  it("returns valid hash anchors usable by edit tool (AC 20)", async () => {
    const { applyHashlineEdits } = await import("../src/hashline.js");
    const smallPath = resolve(fixturesDir, "small.ts");
    const result = await callReadTool({ path: smallPath, symbol: "createDemoDirectory" });
    const rows = parseHashlineRows(getTextContent(result));
    const anchor = rows[0].anchor;
    const content = readFileSync(smallPath, "utf-8");

    const editResult = applyHashlineEdits(content, [
      { set_line: { anchor, new_text: "// edited by symbol read test" } },
    ]);
    expect(editResult.content).toContain("// edited by symbol read test");
    expect(editResult.firstChangedLine).toBe(45);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: FAIL — `symbol` parameter is accepted (Task 8) but no symbol lookup logic exists in `read.ts` yet. The tool returns a normal full-file read. The first test fails because the output contains all 49 lines (not 5) and has no `[Symbol: ...]` header.

**Step 3 — Write minimal implementation**

In `src/read.ts`:

1. Add import at top:
```typescript
import { findSymbol } from "./readmap/symbol-lookup.js";
```

2. Add symbol lookup branch after the file is read and normalized (after `const total = allLines.length;`), before the existing offset/limit logic:

```typescript
// Symbol lookup branch
if (params.symbol) {
  let fileMap: Awaited<ReturnType<typeof getOrGenerateMap>> = null;
  try {
    fileMap = await getOrGenerateMap(absolutePath);
  } catch {
    // Map generation failed — will fall through to normal read
  }

  if (fileMap) {
    const lookupResult = findSymbol(fileMap, params.symbol);

    if (lookupResult.type === "found") {
      const sym = lookupResult.symbol;
      const symStart = sym.startLine;
      const symEnd = Math.min(sym.endLine, total);
      const symSelected = allLines.slice(symStart - 1, symEnd);

      const symFormatted = symSelected
        .map((line, i) => {
          const num = symStart + i;
          return `${num}:${computeLineHash(num, line)}|${line}`;
        })
        .join("\n");

      const symTruncation = truncateHead(symFormatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      let symText = `[Symbol: ${sym.name} (${sym.kind}), lines ${symStart}-${symEnd} of ${total}]\n\n`;
      symText += symTruncation.content;

      if (symTruncation.truncated) {
        symText += `\n\n[Output truncated: showing ${symTruncation.outputLines} of ${symEnd - symStart + 1} symbol lines]`;
      }

      return {
        content: [{ type: "text", text: symText }],
        details: { truncation: symTruncation.truncated ? symTruncation : undefined },
      };
    }

    // ambiguous and not-found fall through to normal read for now
  }
  // fileMap null falls through to normal read for now
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: PASS — all 5 tests pass (2 from Task 8, 3 from this task)

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 10: Ambiguous match → disambiguation message [depends: 5, 9]

**Covers:** AC 16

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```typescript
describe("symbol read — ambiguous match", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("returns disambiguation message with candidates when symbol is ambiguous (AC 16)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "initialize",
    });
    const text = getTextContent(result);

    // Should list candidates, not file content
    expect(text).toContain("ambiguous");
    expect(text).toContain("initialize");

    // Should list all 8 initialize methods with their exact line ranges
    expect(text).toContain("lines 62-146");
    expect(text).toContain("lines 1361-1445");
    expect(text).toContain("lines 2660-2744");
    expect(text).toContain("lines 3959-4043");
    expect(text).toContain("lines 5258-5342");
    expect(text).toContain("lines 6557-6641");
    expect(text).toContain("lines 7856-7940");
    expect(text).toContain("lines 9155-9239");

    // No hashlined content
    expect(text).not.toMatch(/^\d+:[0-9a-f]{2}\|/m);

    // Not an error (informational)
    expect(result.isError).not.toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: FAIL — The ambiguous result from `findSymbol` currently falls through to the normal read path (no disambiguation handling yet). The output contains hashlined content instead of a disambiguation message. The `not.toMatch` assertion on hashline format fails.

**Step 3 — Write minimal implementation**

In `src/read.ts`, inside the symbol lookup branch, add handling for `lookupResult.type === "ambiguous"` after the found block:

```typescript
    if (lookupResult.type === "ambiguous") {
      const candidates = lookupResult.candidates;
      let msg = `Symbol '${params.symbol}' is ambiguous. ${candidates.length} matches found:\n`;
      for (const c of candidates) {
        msg += `  ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}\n`;
      }
      msg += `\nTip: Use dot notation (e.g., ClassName.${params.symbol}) to narrow the search.`;

      return {
        content: [{ type: "text", text: msg }],
        details: {},
      };
    }
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 11: Symbol not found → fallback with warning [depends: 9]

**Covers:** AC 17

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```typescript
describe("symbol read — not found fallback", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("falls back to normal read with warning listing available symbols (AC 17)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "doesNotExist",
    });
    const text = getTextContent(result);

    // Warning with symbol name and available symbols
    expect(text).toContain("[Warning: symbol 'doesNotExist' not found. Available symbols:");
    expect(text).toContain("createDemoDirectory");
    expect(text).toContain("UserDirectory");
    expect(text).toContain("UserRecord");

    // Normal read content follows (hashlined)
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].line).toBe(1);

    // Not an error
    expect(result.isError).not.toBe(true);
  });

  it("caps available symbols at 20 for large files (AC 17)", async () => {
    const result = await callReadTool({
      path: resolve(fixturesDir, "large.ts"),
      symbol: "doesNotExist",
    });
    const text = getTextContent(result);

    expect(text).toContain("[Warning: symbol 'doesNotExist' not found. Available symbols:");

    // Extract the warning line and count listed symbols
    const warningMatch = text.match(/\[Warning: symbol 'doesNotExist' not found\. Available symbols: ([^\]]+)\]/);
    expect(warningMatch).not.toBeNull();
    const symbolList = warningMatch![1].split(", ");
    expect(symbolList.length).toBeLessThanOrEqual(20);

    // Normal hashlined content follows
    expect(text).toMatch(/^\d+:[0-9a-f]{2}\|/m);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: FAIL — Symbol not-found currently falls through to normal read with NO warning prepended. The `toContain("[Warning:")` assertion fails.

**Step 3 — Write minimal implementation**

In `src/read.ts`, two changes:

1. Declare a `symbolWarning` variable before the symbol branch (just inside `execute`, after the conflict check):

```typescript
let symbolWarning: string | undefined;
```

2. Inside the symbol branch, handle the not-found case (replacing the comment `// ambiguous and not-found fall through to normal read for now`):

```typescript
    if (lookupResult.type === "not-found") {
      const topSymbols = fileMap.symbols.slice(0, 20).map(s => s.name).join(", ");
      symbolWarning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${topSymbols}]\n\n`;
      // Fall through to normal read
    }
```

3. At the very end of `execute()`, just before the final `return`, prepend the warning:

```typescript
if (symbolWarning) {
  text = symbolWarning + text;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing — the fallback flows through the existing read code path, including structural map appending on truncation.

---

### Task 12: Unmappable file → fallback with warning [depends: 11]

**Covers:** AC 18

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```typescript
describe("symbol read — unmappable file fallback", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("falls back to normal read with warning when map generation returns null (AC 18)", async () => {
    const cacheModule = await import("../src/map-cache.js");
    vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue(null);

    const result = await callReadTool({
      path: resolve(fixturesDir, "small.ts"),
      symbol: "anything",
    });
    const text = getTextContent(result);

    // Warning about unsupported file type
    expect(text).toContain("[Warning: symbol lookup not available for .ts files — showing full file]");

    // Normal hashlined content follows
    const rows = parseHashlineRows(text);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].line).toBe(1);

    // Not an error
    expect(result.isError).not.toBe(true);
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: FAIL — When `getOrGenerateMap` returns null, the code falls through to normal read with no warning. The `toContain("[Warning: symbol lookup not available")` assertion fails.

**Step 3 — Write minimal implementation**

In `src/read.ts`, inside the symbol branch, handle the `!fileMap` case. Replace the comment `// fileMap null falls through to normal read for now`:

```typescript
  if (!fileMap) {
    symbolWarning = `[Warning: symbol lookup not available for .${ext} files — showing full file]\n\n`;
    // Fall through to normal read
  }
```

The `ext` variable is already computed earlier in the function (line 63: `const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";`). However, it's currently computed AFTER the symbol branch. Move the `ext` extraction to before the symbol branch so it's available.

Specifically, move these two lines from after the directory check to before the symbol branch (right after the directory check on line 59):

```typescript
const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";
```

And keep the image delegation check in place but using the already-extracted `ext`.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 13: Update prompts/read.md [no-test]

**Covers:** AC 21

**Justification:** This is a prompt documentation change. No behavioral code changes — pure documentation of the `symbol` parameter for LLM consumption.

**Files:**
- Modify: `prompts/read.md`

**Step 1 — Make the change**

Replace the contents of `prompts/read.md` with:

```markdown
Read a file. For text files, each line is prefixed with `LINE:HASH|` (e.g., `12:abc12|content`). Use these references as anchors for the `edit` tool.
Images (`jpg`, `png`, `gif`, `webp`) are delegated to the built-in image reader and returned as image attachments.

Default limit: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}.

When a file is truncated (exceeds {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}), a **structural map** is appended after the hashlined content showing file symbols (classes, functions, interfaces, etc.) with line ranges.

Use the appended map for targeted reads with `offset` and `limit` — e.g., `read(path, { offset: LINE, limit: N })`.

Maps support 17 languages (including TypeScript, Python, Rust, Go, C/C++, Java, and more) and are cached in memory by file modification time for fast repeated access.

## Symbol Parameter

Use `symbol` to read a specific symbol by name without knowing its line numbers:

- `read(path, { symbol: "functionName" })` — reads just that function
- `read(path, { symbol: "ClassName.methodName" })` — reads a method inside a class (dot notation)
- `read(path, { symbol: "partial" })` — matches if exactly one symbol name contains the substring

**`symbol` is mutually exclusive with `offset` and `limit`.** Combining them returns an error.

When the symbol is found, output includes a header like `[Symbol: name (kind), lines X-Y of Z]` showing where the symbol sits in the file, followed by hashlined content for just that range. No structural map is appended.

If the symbol is ambiguous (multiple matches), a disambiguation list is shown. Use dot notation (e.g., `ClassName.methodName`) to narrow the search.

If the symbol is not found, the tool falls back to a normal read with a warning listing available symbol names.
```

**Step 2 — Verify**

Run: `npm run typecheck`

Expected: Success (no type errors — prompt file is loaded at runtime, not compiled)

Run: `npm test`

Expected: all passing (existing prompt file tests check the file exists, not its exact content)

---

## AC Coverage Summary

| AC | Task | Description |
|----|------|-------------|
| 1  | 1    | Exact single match → found |
| 2  | 2    | Dot-notation nested match |
| 3  | 3    | Case-insensitive fallback |
| 4  | 4    | Unique partial substring match |
| 5  | 7    | Ambiguous partial match → candidates |
| 6  | 5    | Priority cascade (exact shadows partial) |
| 7  | 1    | Not-found result |
| 8  | 1    | Empty query guard |
| 9  | 1    | Empty symbols guard |
| 10 | 5, 6 | Multi-match same tier → ambiguous |
| 11 | 8    | Schema accepts symbol parameter |
| 12 | 8    | symbol + offset/limit → error |
| 13 | 9    | Found → targeted hashlined content |
| 14 | 9    | Header format [Symbol: name (kind), lines X-Y of Z] |
| 15 | 9    | No structural map on symbol read |
| 16 | 10   | Ambiguous → disambiguation message |
| 17 | 11   | Not found → warning + normal read |
| 18 | 12   | Unmappable → warning + normal read |
| 19 | 9    | Works on small and large files |
| 20 | 9    | Hash anchors valid for edit |
| 21 | 13   | prompts/read.md documents symbol |

## Final `findSymbol` implementation (after Tasks 1-7)

For reference, here is the complete function after all lookup engine tasks:

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
    if (s.children) {
      result.push(...flattenSymbols(s.children));
    }
  }
  return result;
}

export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  const q = query.trim();
  if (!q) return { type: "not-found" };
  if (!map.symbols.length) return { type: "not-found" };

  const all = flattenSymbols(map.symbols);

  // Tier 1: Exact match
  const exact = all.filter(s => s.name === q);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };
  if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };

  // Tier 2: Dot-notation nested match
  if (q.includes(".")) {
    const dotIdx = q.indexOf(".");
    const parentName = q.slice(0, dotIdx);
    const childName = q.slice(dotIdx + 1);
    for (const s of map.symbols) {
      if (s.name === parentName && s.children) {
        const child = s.children.find(c => c.name === childName);
        if (child) return { type: "found", symbol: toMatch(child) };
      }
    }
  }

  // Tier 3: Case-insensitive match
  const qLower = q.toLowerCase();
  const ci = all.filter(s => s.name.toLowerCase() === qLower);
  if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0]) };
  if (ci.length > 1) return { type: "ambiguous", candidates: ci.map(toMatch) };

  // Tier 4: Partial substring match
  const partial = all.filter(s => s.name.toLowerCase().includes(qLower));
  if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
  if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };

  return { type: "not-found" };
}
```

## Final `src/read.ts` symbol branch (after Tasks 8-12)

For reference, the symbol-related additions to `execute()`:

```typescript
// After directory check, before image delegation:
const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";

// After file read + normalization:
let symbolWarning: string | undefined;

if (params.symbol) {
  let fileMap: FileMap | null = null;
  try {
    fileMap = await getOrGenerateMap(absolutePath);
  } catch {
    // Map generation failure
  }

  if (!fileMap) {
    symbolWarning = `[Warning: symbol lookup not available for .${ext} files — showing full file]\n\n`;
  } else {
    const lookupResult = findSymbol(fileMap, params.symbol);

    if (lookupResult.type === "found") {
      // ... targeted read + header + return (Task 9)
    } else if (lookupResult.type === "ambiguous") {
      // ... disambiguation message + return (Task 10)
    } else {
      const topSymbols = fileMap.symbols.slice(0, 20).map(s => s.name).join(", ");
      symbolWarning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${topSymbols}]\n\n`;
    }
  }
}

// ... existing normal read code ...

// Just before final return:
if (symbolWarning) {
  text = symbolWarning + text;
}
```

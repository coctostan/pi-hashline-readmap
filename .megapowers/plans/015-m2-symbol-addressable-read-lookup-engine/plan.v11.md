# Plan: Symbol-Addressable Read (M2) — Revised v6

## Project conventions
- `AGENTS.md` is not present.
- Inferred from `package.json` and existing tests:
  - Language: TypeScript (ESM)
  - Tests: Vitest
  - Single test command: `npx vitest run <file> -t "<test name>"`
  - Full suite: `npm test`

## Spec/source-issue alignment

- **Source of truth:** This plan follows the **Spec / Acceptance Criteria** as authoritative.
- **Ambiguity behavior:** Although Source Issue #008 mentions “prefer largest span” for ambiguity resolution, **AC10 requires ambiguity** when multiple candidates match at the same priority tier. The lookup engine in this plan does **not** auto-select the “largest span”; it returns an `ambiguous` result listing all candidates.

---


### Task 1: Create lookup module with explicit missing-symbol not-found [depends: none]
**Covers:** AC 7

**Files:**
- Create: `src/readmap/symbol-lookup.ts`
- Create: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import type { FileMap } from "../src/readmap/types.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { findSymbol } from "../src/readmap/symbol-lookup.js";

function makeMap(symbols: FileMap["symbols"]): FileMap {
  return {
    path: "/tmp/test.ts",
    totalLines: 100,
    totalBytes: 1000,
    language: "typescript",
    symbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  };
}

describe("findSymbol", () => {
  it("returns not-found for a missing symbol name", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
    ]);

    expect(findSymbol(map, "doesNotExist")).toEqual({ type: "not-found" });
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found for a missing symbol name"`
Expected: FAIL — cannot resolve `../src/readmap/symbol-lookup.js`.

**Step 3 — Write minimal implementation**
```ts
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

  const first = map.symbols[0];
  if (first.name === query) {
    return { type: "found", symbol: toMatch(first) };
  }

  return { type: "not-found" };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found for a missing symbol name"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 2: Guard empty symbol arrays [depends: 1]
**Covers:** AC 9

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append inside `describe("findSymbol", ...)`:
```ts
it("returns not-found when map has no symbols", () => {
  const map = makeMap([]);
  expect(findSymbol(map, "anything")).toEqual({ type: "not-found" });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found when map has no symbols"`
Expected: FAIL — throws because `map.symbols[0]` is undefined (`Cannot read properties of undefined (reading 'name')`).

**Step 3 — Write minimal implementation**
In `findSymbol(...)`, add an empty-array guard before reading `map.symbols[0]`:
```ts
if (map.symbols.length === 0) return { type: "not-found" };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found when map has no symbols"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 3: Exact single-name match across all symbols [depends: 2]
**Covers:** AC 1

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns found for an exact single-name match", () => {
  const map = makeMap([
    { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
    { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
  ]);

  expect(findSymbol(map, "parseConfig")).toEqual({
    type: "found",
    symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found for an exact single-name match"`
Expected: FAIL — current implementation only checks the first symbol and returns `not-found`.

**Step 3 — Write minimal implementation**
Replace `findSymbol(...)` with:
```ts
export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  if (!query) return { type: "not-found" };
  if (map.symbols.length === 0) return { type: "not-found" };

  const exact = map.symbols.filter((s) => s.name === query);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };

  return { type: "not-found" };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found for an exact single-name match"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 4: Exact-tier ambiguity returns only exact-tier candidates [depends: 3]
**Covers:** AC 10, AC 6

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns exact-tier ambiguity only when exact has multiple matches", () => {
  const map = makeMap([
    { name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 10 },
    { name: "init", kind: SymbolKind.Method, startLine: 32, endLine: 40 },
    { name: "initialize", kind: SymbolKind.Function, startLine: 60, endLine: 90 },
  ]);

  expect(findSymbol(map, "init")).toEqual({
    type: "ambiguous",
    candidates: [
      { name: "init", kind: "method", startLine: 3, endLine: 10 },
      { name: "init", kind: "method", startLine: 32, endLine: 40 },
    ],
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns exact-tier ambiguity only when exact has multiple matches"`
Expected: FAIL — current code returns `not-found` for `exact.length > 1`.

**Step 3 — Write minimal implementation**
In `findSymbol(...)`, after exact single-match check, add:
```ts
if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns exact-tier ambiguity only when exact has multiple matches"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 5: Dot-notation nested single match [depends: 4]
**Covers:** AC 2

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("matches child symbol via ClassName.methodName", () => {
  const map = makeMap([
    {
      name: "UserDirectory",
      kind: SymbolKind.Class,
      startLine: 13,
      endLine: 38,
      children: [{ name: "addUser", kind: SymbolKind.Method, startLine: 20, endLine: 33 }],
    },
  ]);

  expect(findSymbol(map, "UserDirectory.addUser")).toEqual({
    type: "found",
    symbol: { name: "addUser", kind: "method", startLine: 20, endLine: 33 },
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "matches child symbol via ClassName.methodName"`
Expected: FAIL — current implementation has no dot-notation lookup.

**Step 3 — Write minimal implementation**
In `findSymbol(...)`, after exact-tier checks and before final not-found:
```ts
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
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "matches child symbol via ClassName.methodName"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 6: Dot-notation nested ambiguity [depends: 5]
**Covers:** AC 10

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns ambiguous for dot-notation when multiple children match", () => {
  const map = makeMap([
    {
      name: "Manager",
      kind: SymbolKind.Class,
      startLine: 1,
      endLine: 20,
      children: [
        { name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 5 },
        { name: "init", kind: SymbolKind.Method, startLine: 10, endLine: 12 },
      ],
    },
  ]);

  expect(findSymbol(map, "Manager.init")).toEqual({
    type: "ambiguous",
    candidates: [
      { name: "init", kind: "method", startLine: 3, endLine: 5 },
      { name: "init", kind: "method", startLine: 10, endLine: 12 },
    ],
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous for dot-notation when multiple children match"`
Expected: FAIL — current nested branch only handles `nested.length === 1`.

**Step 3 — Write minimal implementation**
In nested branch, add:
```ts
if (nested.length > 1) return { type: "ambiguous", candidates: nested.map(toMatch) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous for dot-notation when multiple children match"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 7: Case-insensitive fallback single match [depends: 6]
**Covers:** AC 3, AC 6

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("falls back to case-insensitive match when no exact match exists", () => {
  const map = makeMap([
    { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
    { name: "parseConfigHelper", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
  ]);

  expect(findSymbol(map, "PARSECONFIG")).toEqual({
    type: "found",
    symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "falls back to case-insensitive match when no exact match exists"`
Expected: FAIL — current code returns `not-found`.

**Step 3 — Write minimal implementation**
After nested-tier checks in `findSymbol(...)`:
```ts
const qLower = query.toLowerCase();
const ci = map.symbols.filter((s) => s.name.toLowerCase() === qLower);
if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0]) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "falls back to case-insensitive match when no exact match exists"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 8: Case-insensitive ambiguity [depends: 7]
**Covers:** AC 10

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns ambiguous when case-insensitive tier has multiple matches", () => {
  const map = makeMap([
    { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 20 },
    { name: "PARSECONFIG", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
  ]);

  expect(findSymbol(map, "parseconfig")).toEqual({
    type: "ambiguous",
    candidates: [
      { name: "parseConfig", kind: "function", startLine: 10, endLine: 20 },
      { name: "PARSECONFIG", kind: "function", startLine: 30, endLine: 40 },
    ],
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous when case-insensitive tier has multiple matches"`
Expected: FAIL — current case-insensitive tier only handles single match.

**Step 3 — Write minimal implementation**
After `ci.length === 1` check, add:
```ts
if (ci.length > 1) return { type: "ambiguous", candidates: ci.map(toMatch) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous when case-insensitive tier has multiple matches"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 9: Partial unique fallback [depends: 8]
**Covers:** AC 4, AC 6

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns found when partial tier has exactly one match", () => {
  const map = makeMap([
    { name: "createDemoDirectory", kind: SymbolKind.Function, startLine: 45, endLine: 49 },
    { name: "formatOutput", kind: SymbolKind.Function, startLine: 60, endLine: 70 },
  ]);

  expect(findSymbol(map, "createDemo")).toEqual({
    type: "found",
    symbol: { name: "createDemoDirectory", kind: "function", startLine: 45, endLine: 49 },
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found when partial tier has exactly one match"`
Expected: FAIL — current implementation returns `not-found` for partial queries.

**Step 3 — Write minimal implementation**
After case-insensitive tier checks:
```ts
const partial = map.symbols.filter((s) => s.name.toLowerCase().includes(qLower));
if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found when partial tier has exactly one match"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 10: Partial ambiguity [depends: 9]
**Covers:** AC 5, AC 10

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns ambiguous when partial tier has multiple matches", () => {
  const map = makeMap([
    { name: "processData", kind: SymbolKind.Function, startLine: 1, endLine: 10 },
    { name: "processInput", kind: SymbolKind.Function, startLine: 12, endLine: 22 },
  ]);

  expect(findSymbol(map, "process")).toEqual({
    type: "ambiguous",
    candidates: [
      { name: "processData", kind: "function", startLine: 1, endLine: 10 },
      { name: "processInput", kind: "function", startLine: 12, endLine: 22 },
    ],
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous when partial tier has multiple matches"`
Expected: FAIL — current partial tier only handles unique match.

**Step 3 — Write minimal implementation**
After partial single-match check:
```ts
if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous when partial tier has multiple matches"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 11: Empty query guard with trim [depends: 10]
**Covers:** AC 8

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns not-found for empty or whitespace query", () => {
  const map = makeMap([
    { name: "", kind: SymbolKind.Function, startLine: 1, endLine: 1 },
    { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
  ]);

  expect(findSymbol(map, "   ")).toEqual({ type: "not-found" });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found for empty or whitespace query"`
Expected: FAIL — current code treats non-empty whitespace string as searchable text.

**Step 3 — Write minimal implementation**
At top of `findSymbol(...)`, normalize query and use it throughout:
```ts
const q = query.trim();
if (!q) return { type: "not-found" };

const exact = map.symbols.filter((s) => s.name === q);
...
if (q.includes(".")) {
  const [parentName, childName] = q.split(".", 2);
  ...
}

const qLower = q.toLowerCase();
...
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found for empty or whitespace query"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 12: Add optional `symbol` to read tool schema [depends: 11]
**Covers:** AC 11

**Files:**
- Modify: `src/read.ts`
- Create: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
```ts
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

async function getReadTool() {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = {
    registerTool(def: any) {
      capturedTool = def;
    },
  };
  registerReadTool(mockPi as any);
  if (!capturedTool) throw new Error("read tool was not registered");
  return capturedTool;
}

async function callReadTool(params: ReadParams) {
  const tool = await getReadTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

function parseHashlineRows(text: string): HashlineRow[] {
  const rows: HashlineRow[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^(\d+):([0-9a-f]{2})\|(.*)$/);
    if (!match) continue;
    rows.push({ line: Number(match[1]), hash: match[2], anchor: `${match[1]}:${match[2]}`, content: match[3] });
  }
  return rows;
}

describe("symbol read integration", () => {
  beforeEach(() => clearMapCache());
  afterEach(() => vi.restoreAllMocks());

  it("exposes optional symbol parameter in read tool schema", async () => {
    const tool = await getReadTool();
    expect(tool.parameters.properties.symbol?.type).toBe("string");
    expect(tool.parameters.required ?? []).not.toContain("symbol");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "exposes optional symbol parameter in read tool schema"`
Expected: FAIL — `tool.parameters.properties.symbol` is `undefined`.

**Step 3 — Write minimal implementation**
In `src/read.ts` schema:
```ts
parameters: Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
  symbol: Type.Optional(Type.String({ description: "Symbol to read (e.g., functionName or ClassName.methodName)" })),
}),
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "exposes optional symbol parameter in read tool schema"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 13: Reject `symbol + offset` [depends: 12]
**Covers:** AC 12

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns error when symbol is combined with offset", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "createDemoDirectory",
    offset: 5,
  });

  expect(result.isError).toBe(true);
  expect(getTextContent(result)).toBe("Cannot combine symbol with offset/limit. Use one or the other.");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns error when symbol is combined with offset"`
Expected: FAIL — tool currently returns file content instead of an error.

**Step 3 — Write minimal implementation**
At top of `execute` in `src/read.ts` (after abort check):
```ts
if (params.symbol && params.offset !== undefined) {
  return {
    content: [{ type: "text", text: "Cannot combine symbol with offset/limit. Use one or the other." }],
    isError: true,
    details: {},
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns error when symbol is combined with offset"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 14: Reject `symbol + limit` [depends: 13]
**Covers:** AC 12

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns error when symbol is combined with limit", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "createDemoDirectory",
    limit: 5,
  });

  expect(result.isError).toBe(true);
  expect(getTextContent(result)).toBe("Cannot combine symbol with offset/limit. Use one or the other.");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns error when symbol is combined with limit"`
Expected: FAIL — offset conflict is handled, limit conflict is not.

**Step 3 — Write minimal implementation**
Replace Task 13 check with:
```ts
if (params.symbol && (params.offset !== undefined || params.limit !== undefined)) {
  return {
    content: [{ type: "text", text: "Cannot combine symbol with offset/limit. Use one or the other." }],
    isError: true,
    details: {},
  };
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns error when symbol is combined with limit"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 15: Symbol-found read returns only symbol body rows (small file) [depends: 14]
**Covers:** AC 13, AC 19 (small), AC 20

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns only rows from the matched symbol body", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "createDemoDirectory",
  });

  const text = getTextContent(result);
  const rows = parseHashlineRows(text);

  // Symbol in fixture occupies lines 45-49
  expect(rows).toHaveLength(5);
  expect(rows[0].line).toBe(45);
  expect(rows.some((r) => r.content.includes("export function createDemoDirectory"))).toBe(true);
  expect(rows.some((r) => r.content.includes("return directory;"))).toBe(true);
  // Anchor should apply to the original file (edit-tool compatibility)
  const { applyHashlineEdits } = await import("../src/hashline.js");
  const filePath = resolve(fixturesDir, "small.ts");
  const original = readFileSync(filePath, "utf-8");
  const edited = applyHashlineEdits(original, [
    { set_line: { anchor: rows[0].anchor, new_text: "// symbol-anchor-edit" } },
  ]);
  expect(edited.firstChangedLine).toBe(45);
  expect(edited.content).toContain("// symbol-anchor-edit");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns only rows from the matched symbol body"`
Expected: FAIL — current output is a full-file read (more than 5 rows).

**Step 3 — Write minimal implementation**
Modify `src/read.ts`:

1) Add the import alongside the other `./readmap/...` imports:
```ts
import { findSymbol } from "./readmap/symbol-lookup.js";
```

2) Replace the existing block that computes `startLine`, `endIdx`, and `selected` (currently:
`const startLine = ...` / `const endIdx = ...` / `const selected = ...`) with this complete block:
```ts
let startLine = params.offset ? Math.max(1, params.offset) : 1;
let endIdx = params.limit ? Math.min(startLine - 1 + params.limit, total) : total;
let symbolMatch:
  | { name: string; kind: string; startLine: number; endLine: number }
  | undefined;
if (params.symbol) {
  const fileMap = await getOrGenerateMap(absolutePath);
  if (fileMap) {
    const lookup = findSymbol(fileMap, params.symbol);
    if (lookup.type === "found") {
      startLine = Math.max(1, lookup.symbol.startLine);
      endIdx = Math.min(total, lookup.symbol.endLine);
      symbolMatch = lookup.symbol;
    }
  }
}
const selected = allLines.slice(startLine - 1, endIdx);
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns only rows from the matched symbol body"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 16: Prepend symbol header on found reads [depends: 15]
**Covers:** AC 14, AC 19

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("prepends symbol header with name, kind, and line range", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "createDemoDirectory",
  });

  const text = getTextContent(result);
  expect(text).toMatch(/^\[Symbol: createDemoDirectory \(function\), lines 45-49 of 49\]/);
});
```

Note: `small.ts` has 49 lines (48 content + trailing), and `createDemoDirectory` occupies lines 45–49. This test reads the actual fixture's known structure.

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends symbol header with name, kind, and line range"`
Expected: FAIL — symbol output currently has no `[Symbol: ...]` header.

**Step 3 — Write minimal implementation**
In `src/read.ts`, replace the block that starts at `const truncation = truncateHead(...)` and runs through the final `return { ... }` with this complete version (the only behavioral change is the **symbol header** section near the end):

```ts
const truncation = truncateHead(formatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
let text = truncation.content;

if (truncation.truncated) {
  text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${total} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${startLine + truncation.outputLines} to continue.]`;
} else if (endIdx < total) {
  text += `\n\n[Showing lines ${startLine}-${endIdx} of ${total}. Use offset=${endIdx + 1} to continue.]`;
}

if (truncation.truncated && !params.offset && !params.limit) {
  try {
    const fileMap = await getOrGenerateMap(absolutePath);
    if (fileMap) {
      const mapText = formatFileMapWithBudget(fileMap);
      text += "\n\n" + mapText;
    }
  } catch {
    // Map generation failed — still return hashlined content without map
  }
}

// New: symbol header
if (params.symbol && symbolMatch) {
  text = `[Symbol: ${symbolMatch.name} (${symbolMatch.kind}), lines ${symbolMatch.startLine}-${symbolMatch.endLine} of ${total}]\n\n${text}`;
}

return {
  content: [{ type: "text", text }],
  details: { truncation: truncation.truncated ? truncation : undefined },
};
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends symbol header with name, kind, and line range"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 17: Suppress structural map for found symbol reads [depends: 16]
**Covers:** AC 15

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("does not append File Map for found symbol reads even when output is truncated", async () => {
  const cacheModule = await import("../src/map-cache.js");
  const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

  vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
    path: resolve(fixturesDir, "large.ts"),
    totalLines: 10681,
    totalBytes: 500000,
    language: "typescript",
    symbols: [{ name: "HugeBlock", kind: SymbolKind.Function, startLine: 1, endLine: 5000 }],
    imports: [],
    detailLevel: DetailLevel.Full,
  });

  const result = await callReadTool({
    path: resolve(fixturesDir, "large.ts"),
    symbol: "HugeBlock",
  });

  const text = getTextContent(result);
  expect(text).toContain("[Output truncated:");
  expect(text).not.toContain("File Map:");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "does not append File Map for found symbol reads even when output is truncated"`
Expected: FAIL — current truncated-path logic still appends structural map.

**Step 3 — Write minimal implementation**
In `src/read.ts`, change map-append condition from:
```ts
if (truncation.truncated && !params.offset && !params.limit) {
```
to:
```ts
if (truncation.truncated && !params.offset && !params.limit && !symbolMatch) {
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "does not append File Map for found symbol reads even when output is truncated"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 18: Ambiguous symbol query returns disambiguation text only [depends: 17]
**Covers:** AC 16

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("returns disambiguation text and no hashlines for ambiguous symbol query", async () => {
  const cacheModule = await import("../src/map-cache.js");
  const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

  vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
    path: resolve(fixturesDir, "small.ts"),
    totalLines: 100,
    totalBytes: 1000,
    language: "typescript",
    symbols: [
      { name: "process", kind: SymbolKind.Function, startLine: 1, endLine: 10 },
      { name: "process", kind: SymbolKind.Function, startLine: 20, endLine: 30 },
    ],
    imports: [],
    detailLevel: DetailLevel.Full,
  });

  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "process",
  });

  const text = getTextContent(result);
  expect(text.toLowerCase()).toContain("ambiguous");
  expect(text).toContain("process (function)");
  expect(text).toContain("lines 1-10");
  expect(text).toContain("lines 20-30");
  expect(text).not.toMatch(/^\d+:[0-9a-f]{2}\|/m);
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns disambiguation text and no hashlines for ambiguous symbol query"`
Expected: FAIL — current behavior falls back to normal hashlined file output.

**Step 3 — Write minimal implementation**
In `src/read.ts`, replace the entire `if (params.symbol) { ... }` block (introduced in Task 15) with this complete version:

```ts
if (params.symbol) {
  const fileMap = await getOrGenerateMap(absolutePath);
  if (fileMap) {
    const lookup = findSymbol(fileMap, params.symbol);
    if (lookup.type === "ambiguous") {
      const lines = lookup.candidates.map(
        (c) => `- ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}`,
      );
  return {
    content: [{
            type: "text",
            text: [
              `Symbol '${params.symbol}' is ambiguous.`,
              "Matches:",
              ...lines,
              "Use dot notation to disambiguate.",
            ].join("\n"),
          },
        ],
        isError: false,
        details: {},
      };
    }
    if (lookup.type === "found") {
      startLine = Math.max(1, lookup.symbol.startLine);
      endIdx = Math.min(total, lookup.symbol.endLine);
      symbolMatch = lookup.symbol;
    }
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns disambiguation text and no hashlines for ambiguous symbol query"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 19: Not-found warning + fallback normal read [depends: 18]
**Covers:** AC 17

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("prepends not-found warning and then returns normal hashlines", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "doesNotExist",
  });

  const text = getTextContent(result);
  expect(text).toContain("[Warning: symbol 'doesNotExist' not found. Available symbols:");
  expect(text).toContain("UserRecord");

  const rows = parseHashlineRows(text);
  expect(rows.length).toBeGreaterThan(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends not-found warning and then returns normal hashlines"`
Expected: FAIL — fallback currently has no warning prefix.

**Step 3 — Write minimal implementation**
In `src/read.ts`:
1) After the `symbol + offset/limit` conflict validation and before the symbol-lookup block, add an accumulator for warnings:
```ts
let symbolWarning: string | undefined;
```

2) Replace the entire `if (params.symbol) { ... }` block with this complete version (this adds the **not-found** warning while preserving the **ambiguous** and **found** behaviors from earlier tasks):
```ts
if (params.symbol) {
  const fileMap = await getOrGenerateMap(absolutePath);
  if (fileMap) {
    const lookup = findSymbol(fileMap, params.symbol);

    if (lookup.type === "ambiguous") {
      const lines = lookup.candidates.map(
        (c) => `- ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}`,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `Symbol '${params.symbol}' is ambiguous.`,
              "Matches:",
              ...lines,
              "Use dot notation to disambiguate.",
            ].join("\n"),
          },
        ],
        isError: false,
        details: {},
      };
    }
if (lookup.type === "not-found") {
      const available = fileMap.symbols.map((s) => s.name).join(", ");
      symbolWarning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${available}]\n\n`;
    }

    if (lookup.type === "found") {
      startLine = Math.max(1, lookup.symbol.startLine);
      endIdx = Math.min(total, lookup.symbol.endLine);
      symbolMatch = lookup.symbol;
    }
  }
}
```

3) Replace the truncation/map/return block (the one you replaced in Task 16) with this complete version (the only change is the **symbolWarning** prefix near the end):
```ts
const truncation = truncateHead(formatted, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
let text = truncation.content;

if (truncation.truncated) {
  text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${total} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Use offset=${startLine + truncation.outputLines} to continue.]`;
} else if (endIdx < total) {
  text += `\n\n[Showing lines ${startLine}-${endIdx} of ${total}. Use offset=${endIdx + 1} to continue.]`;
}

if (truncation.truncated && !params.offset && !params.limit && !symbolMatch) {
  try {
    const fileMap = await getOrGenerateMap(absolutePath);
    if (fileMap) {
      const mapText = formatFileMapWithBudget(fileMap);
      text += "\n\n" + mapText;
    }
  } catch {
    // Map generation failed — still return hashlined content without map
  }
}

if (params.symbol && symbolMatch) {
  text = `[Symbol: ${symbolMatch.name} (${symbolMatch.kind}), lines ${symbolMatch.startLine}-${symbolMatch.endLine} of ${total}]\n\n${text}`;
}

// New: warning prefix for symbol not-found fallback
if (symbolWarning) {
  text = symbolWarning + text;
}

return {
  content: [{ type: "text", text }],
  details: { truncation: truncation.truncated ? truncation : undefined },
};
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends not-found warning and then returns normal hashlines"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 20: Cap not-found symbol list at 20 [depends: 19]
**Covers:** AC 17

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("limits not-found available-symbol list to 20 entries", async () => {
  const cacheModule = await import("../src/map-cache.js");
  const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");

  const manySymbols = Array.from({ length: 25 }, (_, i) => ({
    name: `symbol${String(i + 1).padStart(2, "0")}`,
    kind: SymbolKind.Function,
    startLine: i + 1,
    endLine: i + 1,
  }));

  vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue({
    path: resolve(fixturesDir, "small.ts"),
    totalLines: 200,
    totalBytes: 2000,
    language: "typescript",
    symbols: manySymbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  });

  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "missing",
  });

  const text = getTextContent(result);
  const match = text.match(/Available symbols: ([^\]]+)\]/);
  expect(match).not.toBeNull();
  const listed = match![1].split(", ");
  expect(listed.length).toBe(20);
  expect(listed).toContain("symbol01");
  expect(listed).toContain("symbol20");
  expect(listed).not.toContain("symbol21");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "limits not-found available-symbol list to 20 entries"`
Expected: FAIL — warning currently includes all 25 names.

**Step 3 — Write minimal implementation**
In not-found warning code, change list build to:
```ts
const available = fileMap.symbols
  .slice(0, 20)
  .map((s) => s.name)
  .join(", ");
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "limits not-found available-symbol list to 20 entries"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 21: Unmappable-file warning fallback [depends: 20]
**Covers:** AC 18

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**
Append:
```ts
it("falls back with unmappable warning when map is unavailable", async () => {
  const cacheModule = await import("../src/map-cache.js");
  vi.spyOn(cacheModule, "getOrGenerateMap").mockResolvedValue(null);

  const result = await callReadTool({
    path: resolve(fixturesDir, "plain.txt"),
    symbol: "anything",
  });

  const text = getTextContent(result);
  expect(text).toContain("[Warning: symbol lookup not available for .txt files — showing full file]");

  const rows = parseHashlineRows(text);
  expect(rows.length).toBeGreaterThan(0);
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "falls back with unmappable warning when map is unavailable"`
Expected: FAIL — current null-map fallback has no warning prefix.

**Step 3 — Write minimal implementation**
In `src/read.ts`, replace the entire `if (params.symbol) { ... }` block with this complete version (this adds the **unmappable warning** when `fileMap` is null, while preserving **ambiguous**, **not-found**, and **found** behaviors):

```ts
if (params.symbol) {
  const fileMap = await getOrGenerateMap(absolutePath);
if (!fileMap) {
    const extLabel = ext || "unknown";
    symbolWarning = `[Warning: symbol lookup not available for .${extLabel} files — showing full file]\n\n`;
  } else {
    const lookup = findSymbol(fileMap, params.symbol);

    if (lookup.type === "ambiguous") {
      const lines = lookup.candidates.map(
        (c) => `- ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}`,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `Symbol '${params.symbol}' is ambiguous.`,
              "Matches:",
              ...lines,
              "Use dot notation to disambiguate.",
            ].join("\n"),
          },
        ],
        isError: false,
        details: {},
      };
    }

    if (lookup.type === "not-found") {
      const available = fileMap.symbols
        .slice(0, 20)
        .map((s) => s.name)
        .join(", ");
      symbolWarning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${available}]\n\n`;
    }

    if (lookup.type === "found") {
      startLine = Math.max(1, lookup.symbol.startLine);
      endIdx = Math.min(total, lookup.symbol.endLine);
      symbolMatch = lookup.symbol;
    }
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "falls back with unmappable warning when map is unavailable"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 22: Verify symbol-read anchors are edit-compatible [no-test] [depends: 15]

**Justification:** Verification-only. AC20 is already exercised by assertions added in Task 15’s integration test (which applies a hash anchor via `applyHashlineEdits`). No new implementation is expected here.

**Step 1 — Verify**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns only rows from the matched symbol body"`
Expected: PASS

**Step 2 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 23: Verify symbol reads behave correctly on large/truncated files [no-test] [depends: 17]

**Justification:** Verification-only. AC19 (large-file symbol reads) is already covered by Task 17’s integration test (large fixture + truncation path). This task just calls out the explicit verification run.

**Step 1 — Verify**
Run: `npx vitest run tests/symbol-read-integration.test.ts -t "does not append File Map for found symbol reads even when output is truncated"`
Expected: PASS

**Step 2 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 24: Document symbol parameter in read prompt [no-test] [depends: 21]
**Covers:** AC 21

**Justification:** Prompt/documentation-only change; no runtime behavior.

**Files:**
- Modify: `prompts/read.md`

**Step 1 — Make the change**
Update `prompts/read.md` to include:
- `symbol` parameter usage:
  - `read(path, { symbol: "functionName" })`
  - `read(path, { symbol: "ClassName.methodName" })`
- Dot-notation guidance for nested symbols.
- Mutual exclusivity with `offset`/`limit` and exact error text:
  - `Cannot combine symbol with offset/limit. Use one or the other.`
- Behavior notes:
  - Found: prepend `[Symbol: name (kind), lines X-Y of Z]` and return symbol-only hashlines.
  - Ambiguous: disambiguation list only; no hashlines.
  - Not found: warning with up to 20 top-level symbols + normal read.
  - Unmappable: warning with extension + normal read.

Full replacement content for `prompts/read.md`:
```md
Read a file. For text files, each line is prefixed with `LINE:HASH|` (e.g., `12:abc12|content`). Use these references as anchors for the `edit` tool.
Images (`jpg`, `png`, `gif`, `webp`) are delegated to the built-in image reader and returned as image attachments.

Default limit: {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}.

When a file is truncated (exceeds {{DEFAULT_MAX_LINES}} lines or {{DEFAULT_MAX_BYTES}}), a **structural map** is appended after the hashlined content showing file symbols (classes, functions, interfaces, etc.) with line ranges.

Use the appended map for targeted reads with `offset` and `limit` — e.g., `read(path, { offset: LINE, limit: N })`.

Maps support 17 languages (including TypeScript, Python, Rust, Go, C/C++, Java, and more) and are cached in memory by file modification time for fast repeated access.

## Symbol Parameter

Use the `symbol` parameter to read a specific symbol by name — no line numbers needed:

- `read(path, { symbol: "functionName" })` — reads just that function
- `read(path, { symbol: "ClassName.methodName" })` — reads a method inside a class (dot notation)

**Mutual exclusivity:** `symbol` cannot be combined with `offset` or `limit`. Use one addressing mode or the other.

**Behavior by result:**
- **Found:** Returns hashlined content for the symbol's line range only, prepended with `[Symbol: name (kind), lines X-Y of Z]`.
- **Ambiguous (multiple matches):** Returns a disambiguation list with each candidate's name, kind, and line range. Use dot notation (e.g., `ClassName.methodName`) to narrow the match.
- **Not found:** Falls back to a normal read with a warning listing up to 20 available symbol names.
- **Unmappable file:** Falls back to a normal read with a warning noting the file type doesn't support symbol lookup.

Hash anchors from symbol reads are valid for use with the `edit` tool.
```

**Step 2 — Verify**
Run: `npm run typecheck`
Expected: PASS

Run: `npm test`
Expected: all passing

---

## Acceptance Criteria Coverage Matrix

| AC | Covered by Task(s) |
|---|---|
| 1 | 3 |
| 2 | 5 |
| 3 | 7 |
| 4 | 9 |
| 5 | 10 |
| 6 | 4, 7, 9 |
| 7 | 1 |
| 8 | 11 |
| 9 | 2 |
| 10 | 4, 6, 8, 10 |
| 11 | 12 |
| 12 | 13, 14 |
| 13 | 15 |
| 14 | 16 |
| 15 | 17 |
| 16 | 18 |
| 17 | 19, 20 |
| 18 | 21 |
| 19 | 15, 17 |
| 20 | 15 |
| 21 | 24 |

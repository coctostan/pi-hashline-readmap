# Plan: Symbol-Addressable Read (M2) — Revised v3

## Changes from v2

- **Removed Task 7** (AC 7 — not-found for missing symbol): covered by Task 1's default `not-found` return. A standalone test for this passes immediately in Step 2 (violates TDD red-first requirement). AC 7 is the unconditional fallback already written in Task 1's implementation.
- **Removed Task 9** (AC 9 — not-found for empty symbol map): same reasoning — empty array produces no matches through existing code. No new implementation and no genuine failing test.
- **Task 11 (was Tasks 13 + 14 merged)**: Hash anchor check (old AC 20 Task 14) folded into the symbol-range test. One `it(...)` that fails before Task 11's implementation. All assertions (line range, anchor validity) exercise the same behavior: "symbol read returns valid hashlined content."
- **Task 12 (was Task 15, revised)**: Reduced to two focused assertions — header format (AC 14) and no structural map (AC 15). Removed row-count/range assertions that duplicated Task 11's checks. Step 3 shows the exact replacement block in `src/read.ts`, not a reference to a prior task.
- **All tasks renumbered** accordingly (17 tasks total, down from 20).

## Project Conventions

- Language: TypeScript (ESM)
- Test framework: Vitest
- Single-test run: `npx vitest run <test-file> -t "<test name>"`
- Full suite: `npm test`

---

### Task 1: Create symbol lookup module with exact single-match support

**Covers:** AC 1, AC 7 (implicit — default `not-found` return handles missing-symbol case with no extra code), AC 9 (implicit — empty `symbols` array produces no matches through the same fallback)

**Files:**
- Create: `src/readmap/symbol-lookup.ts`
- Create: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

```ts
// tests/symbol-lookup.test.ts
import { describe, it, expect } from "vitest";
import type { FileMap } from "../src/readmap/types.js";
import { SymbolKind, DetailLevel } from "../src/readmap/enums.js";
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
  it("returns found symbol for exact single-name match", () => {
    const map = makeMap([
      { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
      { name: "formatOutput", kind: SymbolKind.Function, startLine: 30, endLine: 40 },
    ]);

    expect(findSymbol(map, "parseConfig")).toEqual({
      type: "found",
      symbol: {
        name: "parseConfig",
        kind: "function",
        startLine: 10,
        endLine: 25,
      },
    });
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found symbol for exact single-name match"`

Expected: FAIL — cannot resolve `../src/readmap/symbol-lookup.js` (file does not exist yet).

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

function flattenSymbols(symbols: FileSymbol[]): FileSymbol[] {
  const out: FileSymbol[] = [];
  for (const s of symbols) {
    out.push(s);
    if (s.children?.length) out.push(...flattenSymbols(s.children));
  }
  return out;
}

export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  const all = flattenSymbols(map.symbols);
  const exact = all.filter((s) => s.name === query);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };
  return { type: "not-found" };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found symbol for exact single-name match"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 2: Add dot-notation nested symbol lookup [depends: 1]

**Covers:** AC 2

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append inside the `describe("findSymbol", ...)` block in `tests/symbol-lookup.test.ts`:

```ts
it("matches child symbol via ClassName.methodName dot notation", () => {
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

  expect(findSymbol(map, "UserDirectory.addUser")).toEqual({
    type: "found",
    symbol: { name: "addUser", kind: "method", startLine: 20, endLine: 33 },
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "matches child symbol via ClassName.methodName dot notation"`

Expected: FAIL — returns `{ type: "not-found" }` because only flat exact matching exists; `"UserDirectory.addUser"` does not match any flattened symbol name.

**Step 3 — Write minimal implementation**

Add this block in `findSymbol` after the exact-match checks (after `if (exact.length === 1)` and before `return { type: "not-found" }`):

```ts
if (query.includes(".")) {
  const [parentName, childName] = query.split(".", 2);
  const nestedMatches: FileSymbol[] = [];

  for (const top of map.symbols) {
    if (top.name !== parentName || !top.children?.length) continue;
    for (const child of top.children) {
      if (child.name === childName) nestedMatches.push(child);
    }
  }

  if (nestedMatches.length === 1) return { type: "found", symbol: toMatch(nestedMatches[0]) };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "matches child symbol via ClassName.methodName dot notation"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 3: Add case-insensitive fallback tier [depends: 2]

**Covers:** AC 3

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```ts
it("falls back to case-insensitive match when no exact match exists", () => {
  const map = makeMap([
    { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
  ]);

  expect(findSymbol(map, "PARSECONFIG")).toEqual({
    type: "found",
    symbol: { name: "parseConfig", kind: "function", startLine: 10, endLine: 25 },
  });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "falls back to case-insensitive match when no exact match exists"`

Expected: FAIL — returns `{ type: "not-found" }` because `"PARSECONFIG" !== "parseConfig"` and no case-insensitive tier exists yet.

**Step 3 — Write minimal implementation**

Add after the dot-notation tier (before the final `return { type: "not-found" }`):

```ts
const queryLower = query.toLowerCase();
const ci = all.filter((s) => s.name.toLowerCase() === queryLower);
if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0]) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "falls back to case-insensitive match when no exact match exists"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 4: Add unique partial-substring match tier [depends: 3]

**Covers:** AC 4

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```ts
it("returns found when exactly one symbol contains the query substring", () => {
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

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found when exactly one symbol contains the query substring"`

Expected: FAIL — returns `{ type: "not-found" }` because no partial-match tier exists.

**Step 3 — Write minimal implementation**

Add after the case-insensitive tier:

```ts
const partial = all.filter((s) => s.name.toLowerCase().includes(queryLower));
if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns found when exactly one symbol contains the query substring"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 5: Return ambiguous for multi-match partial tier [depends: 4]

**Covers:** AC 5

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```ts
it("returns ambiguous with all candidates when partial tier matches multiple symbols", () => {
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

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous with all candidates when partial tier matches multiple symbols"`

Expected: FAIL — returns `{ type: "not-found" }` because the multi-match partial path is unhandled.

**Step 3 — Write minimal implementation**

Add immediately after the `partial.length === 1` check:

```ts
if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns ambiguous with all candidates when partial tier matches multiple symbols"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 6: Return ambiguous for multi-match exact tier and preserve priority [depends: 5]

**Covers:** AC 10, AC 6

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```ts
it("returns exact-tier ambiguity only (does not mix lower-tier matches)", () => {
  const map = makeMap([
    {
      name: "A",
      kind: SymbolKind.Class,
      startLine: 1,
      endLine: 20,
      children: [{ name: "init", kind: SymbolKind.Method, startLine: 3, endLine: 10 }],
    },
    {
      name: "B",
      kind: SymbolKind.Class,
      startLine: 30,
      endLine: 50,
      children: [{ name: "init", kind: SymbolKind.Method, startLine: 32, endLine: 40 }],
    },
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

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns exact-tier ambiguity only (does not mix lower-tier matches)"`

Expected: FAIL — exact multi-match currently falls through to the partial tier, which returns `ambiguous` with three candidates instead of two exact-tier candidates.

**Step 3 — Write minimal implementation**

In `findSymbol`, directly after `if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };`:

```ts
if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns exact-tier ambiguity only (does not mix lower-tier matches)"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 7: Return not-found for empty query [depends: 6]

**Covers:** AC 8

**Files:**
- Modify: `src/readmap/symbol-lookup.ts`
- Modify: `tests/symbol-lookup.test.ts`
- Test: `tests/symbol-lookup.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-lookup.test.ts`:

```ts
it("returns not-found for empty query string", () => {
  const map = makeMap([
    { name: "", kind: SymbolKind.Function, startLine: 1, endLine: 1 },
    { name: "parseConfig", kind: SymbolKind.Function, startLine: 10, endLine: 25 },
  ]);

  expect(findSymbol(map, "")).toEqual({ type: "not-found" });
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found for empty query string"`

Expected: FAIL — empty query `""` exactly matches the empty-name symbol and returns `{ type: "found", symbol: { name: "", ... } }`.

**Step 3 — Write minimal implementation**

At the very top of `findSymbol`, before any matching logic, add an early guard and switch to `q` throughout:

```ts
export function findSymbol(map: FileMap, query: string): SymbolLookupResult {
  const q = query.trim();
  if (!q) return { type: "not-found" };

  const all = flattenSymbols(map.symbols);
  const exact = all.filter((s) => s.name === q);
  if (exact.length === 1) return { type: "found", symbol: toMatch(exact[0]) };
  if (exact.length > 1) return { type: "ambiguous", candidates: exact.map(toMatch) };

  if (q.includes(".")) {
    const [parentName, childName] = q.split(".", 2);
    const nestedMatches: FileSymbol[] = [];
    for (const top of map.symbols) {
      if (top.name !== parentName || !top.children?.length) continue;
      for (const child of top.children) {
        if (child.name === childName) nestedMatches.push(child);
      }
    }
    if (nestedMatches.length === 1) return { type: "found", symbol: toMatch(nestedMatches[0]) };
  }

  const queryLower = q.toLowerCase();
  const ci = all.filter((s) => s.name.toLowerCase() === queryLower);
  if (ci.length === 1) return { type: "found", symbol: toMatch(ci[0]) };

  const partial = all.filter((s) => s.name.toLowerCase().includes(queryLower));
  if (partial.length === 1) return { type: "found", symbol: toMatch(partial[0]) };
  if (partial.length > 1) return { type: "ambiguous", candidates: partial.map(toMatch) };

  return { type: "not-found" };
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-lookup.test.ts -t "returns not-found for empty query string"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 8: Add `symbol` to read tool schema [depends: 7]

**Covers:** AC 11

**Files:**
- Modify: `src/read.ts`
- Create: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

```ts
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

async function getReadTool() {
  const { registerReadTool } = await import("../src/read.js");
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
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

In `src/read.ts`, add `symbol` to the schema's `Type.Object({...})` block (after the existing `limit` line):

```ts
parameters: Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
  symbol: Type.Optional(Type.String({ description: "Symbol name to read (e.g., 'functionName' or 'ClassName.methodName')" })),
}),
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "exposes optional symbol parameter in read tool schema"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 9: Reject `symbol + offset` combination [depends: 8]

**Covers:** AC 12 (offset case)

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append inside `describe("symbol read integration", ...)` in `tests/symbol-read-integration.test.ts`:

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

Expected: FAIL — read tool ignores `symbol` and returns normal file content; `result.isError` is `undefined`.

**Step 3 — Write minimal implementation**

In `src/read.ts`, add after `throwIfAborted(signal)` (line 40), before the file-access check:

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

### Task 10: Reject `symbol + limit` combination [depends: 9]

**Covers:** AC 12 (limit case)

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

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

Expected: FAIL — only the `offset` conflict is currently validated; `limit`-only passes through and returns file content.

**Step 3 — Write minimal implementation**

Replace the Task 9 check in `src/read.ts` with:

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

### Task 11: Read only the matched symbol's line range and validate hash anchors [depends: 10]

**Covers:** AC 13, AC 19 (small file), AC 20

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```ts
it("returns only the symbol's line range and produces valid hash anchors", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "createDemoDirectory",
  });

  const text = getTextContent(result);
  const rows = parseHashlineRows(text);
  expect(rows).toHaveLength(5);
  expect(rows[0].line).toBe(45);
  expect(rows[rows.length - 1].line).toBe(49);

  // AC 20: anchors produced by a symbol read must work with applyHashlineEdits
  const { applyHashlineEdits } = await import("../src/hashline.js");
  const filePath = resolve(fixturesDir, "small.ts");
  const original = readFileSync(filePath, "utf-8");
  const editResult = applyHashlineEdits(original, [
    { set_line: { anchor: rows[0].anchor, new_text: "// symbol-anchor-edit" } },
  ]);
  expect(editResult.content).toContain("// symbol-anchor-edit");
  expect(editResult.firstChangedLine).toBe(45);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns only the symbol's line range and produces valid hash anchors"`

Expected: FAIL — output is a normal full-file read (all 49 hashlined lines); `rows.toHaveLength(5)` fails (receives 49 rows).

**Step 3 — Write minimal implementation**

1. Add import at the top of `src/read.ts` (after existing imports):

```ts
import { findSymbol } from "./readmap/symbol-lookup.js";
```

2. Add the symbol branch in `execute`, immediately after `const total = allLines.length;` and before `const startLine = params.offset ? ...`:

```ts
if (params.symbol) {
  const fileMap = await getOrGenerateMap(absolutePath);
  if (fileMap) {
    const lookup = findSymbol(fileMap, params.symbol);
    if (lookup.type === "found") {
      const start = lookup.symbol.startLine;
      const end = Math.min(lookup.symbol.endLine, total);
      const selectedSymbol = allLines.slice(start - 1, end);
      const formattedSymbol = selectedSymbol
        .map((line, i) => {
          const num = start + i;
          return `${num}:${computeLineHash(num, line)}|${line}`;
        })
        .join("\n");

      const truncation = truncateHead(formattedSymbol, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
      return {
        content: [{ type: "text", text: truncation.content }],
        details: { truncation: truncation.truncated ? truncation : undefined },
      };
    }
  }
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns only the symbol's line range and produces valid hash anchors"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 12: Add symbol header and verify no structural map on symbol reads [depends: 11]

**Covers:** AC 14, AC 15, AC 19 (large file)

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```ts
it("prepends symbol header and produces no structural map for large-file symbol reads", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "large.ts"),
    symbol: "parseConfig",
  });

  const text = getTextContent(result);
  expect(text).toContain("[Symbol: parseConfig (function), lines 10437-10459 of 10681]");
  expect(text).not.toContain("File Map:");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends symbol header and produces no structural map for large-file symbol reads"`

Expected: FAIL — symbol output (from Task 11) is bare hashlines with no `[Symbol: ...]` prefix; `toContain("[Symbol: parseConfig ...")` fails.

**Step 3 — Write minimal implementation**

In `src/read.ts`, locate the found-symbol return block added in Task 11:

```ts
      // Task 11's return — replace this:
      return {
        content: [{ type: "text", text: truncation.content }],
        details: { truncation: truncation.truncated ? truncation : undefined },
      };
```

Replace with:

```ts
      const header = `[Symbol: ${lookup.symbol.name} (${lookup.symbol.kind}), lines ${start}-${end} of ${total}]`;
      const symbolText = `${header}\n\n${truncation.content}`;
      return {
        content: [{ type: "text", text: symbolText }],
        details: { truncation: truncation.truncated ? truncation : undefined },
      };
```

The `not.toContain("File Map:")` assertion is satisfied automatically: the symbol branch returns before the `if (truncation.truncated && !params.offset && !params.limit)` map-append block is ever reached.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends symbol header and produces no structural map for large-file symbol reads"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 13: Return disambiguation message for ambiguous symbol queries [depends: 12]

**Covers:** AC 16

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```ts
it("returns disambiguation text (no hashlined content) when symbol query is ambiguous", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "large.ts"),
    symbol: "initialize",
  });

  const text = getTextContent(result);
  expect(text.toLowerCase()).toContain("ambiguous");
  expect(text).toContain("initialize (method) — lines 62-146");
  expect(text).not.toMatch(/^\d+:[0-9a-f]{2}\|/m);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns disambiguation text (no hashlined content) when symbol query is ambiguous"`

Expected: FAIL — ambiguous lookup currently falls through to the normal full-file read (large.ts), which contains hashlines.

**Step 3 — Write minimal implementation**

Inside the `if (fileMap) { ... }` block in `src/read.ts`, add after the found-symbol `if (lookup.type === "found") { ... }` block:

```ts
    if (lookup.type === "ambiguous") {
      const lines = lookup.candidates.map(
        (c) => `- ${c.name} (${c.kind}) — lines ${c.startLine}-${c.endLine}`
      );
      const msg = [
        `Symbol '${params.symbol}' is ambiguous.`,
        "Matches:",
        ...lines,
        "Use dot notation (e.g., ClassName.methodName) to disambiguate.",
      ].join("\n");

      return {
        content: [{ type: "text", text: msg }],
        details: {},
      };
    }
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "returns disambiguation text (no hashlined content) when symbol query is ambiguous"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 14: Add not-found warning and fall back to normal read [depends: 13]

**Covers:** AC 17

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```ts
it("prepends not-found warning with available symbols and then returns normal hashlines", async () => {
  const result = await callReadTool({
    path: resolve(fixturesDir, "small.ts"),
    symbol: "doesNotExist",
  });

  const text = getTextContent(result);
  expect(text).toContain("[Warning: symbol 'doesNotExist' not found. Available symbols:");
  expect(text).toContain("UserRecord");
  expect(text).toContain("UserDirectory");
  expect(text).toContain("createDemoDirectory");

  const rows = parseHashlineRows(text);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0].line).toBe(1);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends not-found warning with available symbols and then returns normal hashlines"`

Expected: FAIL — no warning prefix exists; output is a bare normal read starting at line 1 with no `[Warning: ...]` prefix. `toContain("[Warning: symbol 'doesNotExist'...")` fails.

**Step 3 — Write minimal implementation**

1. Declare a warning accumulator in `execute`, after the symbol+offset/limit conflict check:

```ts
let symbolWarning: string | undefined;
```

2. Inside the `if (params.symbol) { ... }` block, after `if (fileMap) { ... }`, add not-found handling inside the `if (fileMap)` block, after the ambiguous branch:

```ts
    if (lookup.type === "not-found") {
      const available = fileMap.symbols.map((s) => s.name).join(", ");
      symbolWarning = `[Warning: symbol '${params.symbol}' not found. Available symbols: ${available}]\n\n`;
    }
```

3. Before the final `return` at the end of `execute` (the normal-read `return { content: [{ type: "text", text }], ... }`), prepend the warning:

```ts
if (symbolWarning) {
  text = symbolWarning + text;
}
```

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "prepends not-found warning with available symbols and then returns normal hashlines"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 15: Cap not-found warning symbol list at 20 names [depends: 14]

**Covers:** AC 17 (20-name cap)

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

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
  const m = text.match(/Available symbols: ([^\]]+)\]/);
  expect(m).not.toBeNull();
  const listed = m![1].split(", ");
  expect(listed.length).toBe(20);
  expect(listed).toContain("symbol01");
  expect(listed).toContain("symbol20");
  expect(listed).not.toContain("symbol21");
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "limits not-found available-symbol list to 20 entries"`

Expected: FAIL — warning currently includes all 25 names; `listed.length` is 25.

**Step 3 — Write minimal implementation**

In the not-found warning code from Task 14, replace the list construction with:

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

### Task 16: Add unmappable-file warning fallback using `.txt` fixture [depends: 15]

**Covers:** AC 18

**Files:**
- Modify: `src/read.ts`
- Modify: `tests/symbol-read-integration.test.ts`
- Test: `tests/symbol-read-integration.test.ts`

**Step 1 — Write the failing test**

Append to `tests/symbol-read-integration.test.ts`:

```ts
it("falls back to normal read with unmappable warning for .txt symbol query", async () => {
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
  expect(rows[0].line).toBe(1);
});
```

**Step 2 — Run test, verify it fails**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "falls back to normal read with unmappable warning for .txt symbol query"`

Expected: FAIL — null-map fallback currently has no warning prefix; output starts with bare hashlines.

**Step 3 — Write minimal implementation**

In `src/read.ts`, inside the `if (params.symbol) { ... }` block, immediately after `const fileMap = await getOrGenerateMap(absolutePath);`:

```ts
  if (!fileMap) {
    symbolWarning = `[Warning: symbol lookup not available for .${ext} files — showing full file]\n\n`;
  }
```

Note: `ext` is already computed earlier in `execute` via `const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";`.

**Step 4 — Run test, verify it passes**

Run: `npx vitest run tests/symbol-read-integration.test.ts -t "falls back to normal read with unmappable warning for .txt symbol query"`

Expected: PASS

**Step 5 — Verify no regressions**

Run: `npm test`

Expected: all passing

---

### Task 17: Document `symbol` parameter in prompt [no-test] [depends: 16]

**Covers:** AC 21

**Justification:** Prompt/documentation-only change; no runtime behavior change.

**Files:**
- Modify: `prompts/read.md`

**Step 1 — Make the change**

Update `prompts/read.md` to include:

- `symbol` parameter usage examples:
  - `read(path, { symbol: "functionName" })`
  - `read(path, { symbol: "ClassName.methodName" })`
- Dot-notation guidance for nested symbols (e.g., class methods via `ClassName.methodName`).
- Mutual exclusivity with `offset`/`limit` and exact error message:
  - `Cannot combine symbol with offset/limit. Use one or the other.`
- Behavior notes:
  - Found: returns `[Symbol: name (kind), lines X-Y of Z]` header followed by symbol-only hashlines.
  - Ambiguous: returns disambiguation list with each candidate's name, kind, and line range; no hashlines.
  - Not found: prepends `[Warning: symbol 'X' not found. Available symbols: ...]` (up to 20 names) then returns normal read.
  - Unmappable file: prepends `[Warning: symbol lookup not available for .ext files — showing full file]` then returns normal read.

**Step 2 — Verify**

Run: `npm run typecheck`

Expected: PASS

Run: `npm test`

Expected: all passing

---

## Acceptance Criteria Coverage Matrix

| AC | Covered by Task |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 |
| 7 | 1 (implicit — default `not-found` fallback; no dedicated test as a standalone test would pass immediately) |
| 8 | 7 |
| 9 | 1 (implicit — empty `symbols` array produces no matches; no dedicated test for same reason) |
| 10 | 6 |
| 11 | 8 |
| 12 | 9, 10 |
| 13 | 11 |
| 14 | 12 |
| 15 | 12 |
| 16 | 13 |
| 17 | 14, 15 |
| 18 | 16 |
| 19 | 11, 12 |
| 20 | 11 |
| 21 | 17 |

## Notes

- **v3 changes from v2:**
  - Removed Task 7 (AC 7 — not-found for missing symbol): standalone test passes immediately in Step 2 (TDD violation). AC 7 is the unconditional `return { type: "not-found" }` fallback already written in Task 1's implementation.
  - Removed Task 9 (AC 9 — not-found for empty symbol map): same reasoning. Empty `symbols` array → `flattenSymbols([]) = []` → no matches → `not-found` without any new code.
  - Task 11 (was Tasks 13 + 14): Hash anchor check folded into the symbol-range test. One `it(...)`, all assertions fail before Task 11's implementation (symbol branch doesn't exist yet). Covers AC 13, AC 19 (small file), and AC 20.
  - Task 12 (was Task 15): Focused to two assertions — header format (AC 14) and no structural map (AC 15). Row-count/range assertions removed (AC 13/19 already covered by Task 11 for small files; the same code path handles large files). Step 3 shows the exact replacement block without forward references.
  - Total: 17 tasks (was 20).

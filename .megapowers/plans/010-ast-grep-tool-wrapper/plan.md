# Plan: AST-Grep Tool Wrapper (M3)

## Project conventions
- Language: TypeScript (ESM)
- Tests: Vitest
- Single test command: `npx vitest run <file> -t "<test name>"`
- Full suite: `npm test`
- Tool registration pattern: `registerXxxTool(pi)` in a `src/xxx.ts` file, called from `index.ts`
- Prompt loading pattern: `readFileSync(new URL("../prompts/xxx.md", import.meta.url), "utf-8")`

---

### Task 1: Create sg module skeleton with tool schema [depends: none]
**Covers:** AC 1, 2, 3, 4

**Files:**
- Create: `src/sg.ts`
- Create: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
import { describe, it, expect } from "vitest";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let capturedTool: any = null;
  const mockPi = {
    registerTool(def: any) {
      capturedTool = def;
    },
  };
  registerSgTool(mockPi as any);
  if (!capturedTool) throw new Error("sg tool was not registered");
  return capturedTool;
}

describe("sg tool", () => {
  it("registers with correct name and schema", async () => {
    const tool = await getSgTool();
    expect(tool.name).toBe("sg");
    expect(tool.parameters.properties.pattern.type).toBe("string");
    expect(tool.parameters.properties.lang?.type).toBe("string");
    expect(tool.parameters.properties.path?.type).toBe("string");
    expect(tool.parameters.required).toContain("pattern");
    expect(tool.parameters.required).not.toContain("lang");
    expect(tool.parameters.required).not.toContain("path");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.test.ts -t "registers with correct name and schema"`
Expected: FAIL — cannot resolve `../src/sg.js`.

**Step 3 — Write minimal implementation**
Create `src/sg.ts`:
```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export function registerSgTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "sg",
    label: "AST Grep",
    description: "Structural code search using ast-grep. Returns hashline-anchored results.",
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to search for (e.g., 'console.log($$$ARGS)')" }),
      lang: Type.Optional(Type.String({ description: "Language hint (e.g., 'typescript', 'python')" })),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
    }),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      return { content: [{ type: "text", text: "not implemented" }], details: {} };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.test.ts -t "registers with correct name and schema"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 2: Wire registerSgTool into index.ts [depends: 1]
**Covers:** AC 20

**Files:**
- Modify: `index.ts`
- Modify: `tests/entry-point.test.ts`
- Test: `tests/entry-point.test.ts`

**Step 1 — Write the failing test**
Add to `tests/entry-point.test.ts`:
```ts
it("registers sg tool", async () => {
  const { default: init } = await import("../index.js");
  const tools: string[] = [];
  const mockPi = { registerTool: (def: any) => tools.push(def.name) };
  init(mockPi as any);
  expect(tools).toContain("sg");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/entry-point.test.ts -t "registers sg tool"`
Expected: FAIL — "sg" not in registered tools.

**Step 3 — Write minimal implementation**
In `index.ts`, add:
```ts
import { registerSgTool } from "./src/sg.js";
```
And in the default export function:
```ts
registerSgTool(pi);
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/entry-point.test.ts -t "registers sg tool"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 3: Detect sg not installed [depends: 1]
**Covers:** AC 14

**Files:**
- Modify: `src/sg.ts`
- Modify: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("returns error when sg is not installed", async () => {
  const tool = await getSgTool();

  // Mock execFile to simulate command-not-found
  const { vi } = await import("vitest");
  const cp = await import("child_process");
  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    const err = new Error("command not found: sg") as any;
    err.code = "ENOENT";
    cb(err, "", "");
    return {} as any;
  });

  const result = await tool.execute("test", { pattern: "test" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("ast-grep (sg) is not installed");
  expect(result.content[0].text).toContain("brew install ast-grep");

  vi.restoreAllMocks();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.test.ts -t "returns error when sg is not installed"`
Expected: FAIL — execute returns "not implemented".

**Step 3 — Write minimal implementation**
In `src/sg.ts`, implement the execute function with CLI invocation and ENOENT handling:
```ts
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveToCwd } from "./path-utils";

const execFileAsync = promisify(execFile);

// Inside execute:
async execute(_toolCallId, params, signal, _onUpdate, ctx) {
  const searchPath = resolveToCwd(params.path || ".", ctx.cwd);

  const args = ["run", "--json", "-p", params.pattern];
  if (params.lang) args.push("-l", params.lang);
  args.push(searchPath);

  let stdout: string;
  try {
    const result = await execFileAsync("sg", args, { maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {
        content: [{ type: "text", text: "ast-grep (sg) is not installed. Run: brew install ast-grep" }],
        isError: true,
        details: {},
      };
    }
    return {
      content: [{ type: "text", text: err.stderr || err.message }],
      isError: true,
      details: {},
    };
  }

  return { content: [{ type: "text", text: stdout }], details: {} };
},
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.test.ts -t "returns error when sg is not installed"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 4: Handle sg non-zero exit (bad pattern) [depends: 3]
**Covers:** AC 15

**Files:**
- Modify: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("returns error with stderr when sg exits non-zero", async () => {
  const tool = await getSgTool();
  const { vi } = await import("vitest");
  const cp = await import("child_process");

  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    const err = new Error("sg failed") as any;
    err.code = 1;
    err.stderr = "Error: invalid pattern syntax";
    cb(err, "", "Error: invalid pattern syntax");
    return {} as any;
  });

  const result = await tool.execute("test", { pattern: "{{bad" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("invalid pattern syntax");

  vi.restoreAllMocks();
});
```

**Step 2 — Run test, verify it passes (already implemented)**
Run: `npx vitest run tests/sg.test.ts -t "returns error with stderr when sg exits non-zero"`
Expected: PASS — the catch block in Task 3 already handles this case with `err.stderr || err.message`.

Note: If it passes immediately, this is a [no-test] verification task. If it fails, add the missing error handling.

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 5: Parse sg JSON and format no-match output [depends: 3]
**Covers:** AC 13

**Files:**
- Modify: `src/sg.ts`
- Modify: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("returns no-match message when sg finds nothing", async () => {
  const tool = await getSgTool();
  const { vi } = await import("vitest");
  const cp = await import("child_process");

  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, "[]", "");
    return {} as any;
  });

  const result = await tool.execute("test", { pattern: "nonExistentPattern" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

  expect(result.isError).toBeFalsy();
  expect(result.content[0].text).toBe('No matches found for pattern: nonExistentPattern');

  vi.restoreAllMocks();
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.test.ts -t "returns no-match message when sg finds nothing"`
Expected: FAIL — currently returns raw `"[]"` string.

**Step 3 — Write minimal implementation**
After the try/catch in execute, parse the JSON and handle empty:
```ts
const matches = JSON.parse(stdout);
if (!Array.isArray(matches) || matches.length === 0) {
  return {
    content: [{ type: "text", text: `No matches found for pattern: ${params.pattern}` }],
    details: {},
  };
}

// TODO: format matches with hashline anchors
return { content: [{ type: "text", text: stdout }], details: {} };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.test.ts -t "returns no-match message when sg finds nothing"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 6: Format single-file single-match with hashline anchors [depends: 5]
**Covers:** AC 8, 10, 11, 12

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg-integration.test.ts`
- Test: `tests/sg-integration.test.ts`

**Step 1 — Write the failing test**
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerSgTool(mockPi as any);
  if (!capturedTool) throw new Error("sg tool was not registered");
  return capturedTool;
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

function parseHashlineRows(text: string) {
  const rows: Array<{ file?: string; line: number; hash: string; anchor: string; content: string }> = [];
  for (const line of text.split("\n")) {
    // Format: path:>>LINE:HASH|content  or  >>LINE:HASH|content
    const match = line.match(/^(?:(.+?):)?>>(\d+):([0-9a-f]{2})\|(.*)$/);
    if (!match) continue;
    rows.push({
      file: match[1] || undefined,
      line: Number(match[2]),
      hash: match[3],
      anchor: `${match[2]}:${match[3]}`,
      content: match[4],
    });
  }
  return rows;
}

describe("sg integration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("formats single-file match with hashline anchors", async () => {
    const tool = await getSgTool();

    const result = await tool.execute(
      "test",
      { pattern: "export function $NAME($$$PARAMS): $RET { $$$BODY }", lang: "typescript", path: resolve(fixturesDir, "small.ts") },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();
    const text = getTextContent(result);
    const rows = parseHashlineRows(text);

    // small.ts has createDemoDirectory on lines 45-49 (1-indexed)
    expect(rows.length).toBe(5);
    expect(rows[0].line).toBe(45);
    expect(rows[rows.length - 1].line).toBe(49);
    expect(rows[0].content).toContain("export function createDemoDirectory");

    // Verify hashes match actual file content
    const { computeLineHash } = await import("../src/hashline.js");
    const fileLines = readFileSync(resolve(fixturesDir, "small.ts"), "utf-8").split("\n");
    for (const row of rows) {
      const expected = computeLineHash(row.line, fileLines[row.line - 1]);
      expect(row.hash).toBe(expected);
    }
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg-integration.test.ts -t "formats single-file match with hashline anchors"`
Expected: FAIL — current output is raw JSON.

**Step 3 — Write minimal implementation**
In `src/sg.ts`, add the formatting logic after JSON parse:

```ts
import { computeLineHash } from "./hashline";
import { readFile as fsReadFile } from "fs/promises";
import { normalizeToLF, stripBom } from "./edit-diff";
import path from "path";

interface SgMatch {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
  text: string;
  lines: string;
}

// File cache for reading source lines
const fileCache = new Map<string, string[]>();

async function getFileLines(absolutePath: string): Promise<string[] | null> {
  if (fileCache.has(absolutePath)) return fileCache.get(absolutePath)!;
  try {
    const raw = (await fsReadFile(absolutePath)).toString("utf-8");
    const lines = normalizeToLF(stripBom(raw).text).split("\n");
    fileCache.set(absolutePath, lines);
    return lines;
  } catch {
    return null;
  }
}

function formatMatches(matches: SgMatch[], searchPath: string): string {
  const output: string[] = [];

  for (const match of matches) {
    const absFile = path.resolve(searchPath, match.file);
    // Will be filled in by caller after async file reads
    output.push(JSON.stringify({ absFile, match })); // placeholder
  }

  return output.join("\n");
}
```

Then in `execute`, after the empty-check:

```ts
// Clear file cache per invocation
fileCache.clear();

const output: string[] = [];

for (const match of matches as SgMatch[]) {
  const absFile = path.isAbsolute(match.file) ? match.file : path.resolve(searchPath, match.file);
  const fileLines = await getFileLines(absFile);
  if (!fileLines) continue; // AC 16: skip unreadable files

  const startLine = match.range.start.line + 1; // 0-indexed → 1-indexed
  const endLine = match.range.end.line + 1;

  for (let i = startLine; i <= endLine; i++) {
    const sourceLine = fileLines[i - 1] ?? "";
    const hash = computeLineHash(i, sourceLine);
    output.push(`>>${i}:${hash}|${sourceLine}`);
  }
}

if (output.length === 0) {
  return {
    content: [{ type: "text", text: `No matches found for pattern: ${params.pattern}` }],
    details: {},
  };
}

return {
  content: [{ type: "text", text: output.join("\n") }],
  details: {},
};
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg-integration.test.ts -t "formats single-file match with hashline anchors"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 7: Multi-file match grouping with headers [depends: 6]
**Covers:** AC 9

**Files:**
- Modify: `src/sg.ts`
- Modify: `tests/sg-integration.test.ts`
- Test: `tests/sg-integration.test.ts`

**Step 1 — Write the failing test**
```ts
it("groups matches by file with headers when multiple files match", async () => {
  const tool = await getSgTool();
  const cp = await import("child_process");

  // Mock sg output with matches from two files
  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    const matches = [
      {
        file: resolve(fixturesDir, "small.ts"),
        range: { byteOffset: { start: 0, end: 0 }, start: { line: 44, column: 0 }, end: { line: 44, column: 50 } },
        text: "export function createDemoDirectory(): UserDirectory {",
        lines: "export function createDemoDirectory(): UserDirectory {",
      },
      {
        file: resolve(fixturesDir, "plain.txt"),
        range: { byteOffset: { start: 0, end: 0 }, start: { line: 0, column: 0 }, end: { line: 0, column: 10 } },
        text: "Hello World",
        lines: "Hello World",
      },
    ];
    cb(null, JSON.stringify(matches), "");
    return {} as any;
  });

  const result = await tool.execute(
    "test",
    { pattern: "test" },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  const text = getTextContent(result);
  expect(text).toContain("--- ");
  // Should have two file headers
  const headers = text.split("\n").filter((l: string) => l.startsWith("--- "));
  expect(headers.length).toBe(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg-integration.test.ts -t "groups matches by file with headers when multiple files match"`
Expected: FAIL — current output has no `---` headers.

**Step 3 — Write minimal implementation**
In `src/sg.ts`, modify the formatting loop to track the current file and emit headers on file change:

```ts
let currentFile = "";

for (const match of matches as SgMatch[]) {
  const absFile = path.isAbsolute(match.file) ? match.file : path.resolve(searchPath, match.file);
  const displayFile = path.relative(ctx.cwd, absFile);
  const fileLines = await getFileLines(absFile);
  if (!fileLines) continue;

  if (displayFile !== currentFile) {
    if (currentFile !== "") output.push(""); // blank line between files
    output.push(`--- ${displayFile} ---`);
    currentFile = displayFile;
  }

  const startLine = match.range.start.line + 1;
  const endLine = match.range.end.line + 1;

  for (let i = startLine; i <= endLine; i++) {
    const sourceLine = fileLines[i - 1] ?? "";
    const hash = computeLineHash(i, sourceLine);
    output.push(`>>${i}:${hash}|${sourceLine}`);
  }
}
```

Note: For single-file results, still emit the header for consistency (simpler code, and the agent always knows which file is being shown).

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg-integration.test.ts -t "groups matches by file with headers when multiple files match"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 8: Verify single-file also shows file header [depends: 7]
**Covers:** AC 9 (consistency check)

**Files:**
- Modify: `tests/sg-integration.test.ts`
- Test: `tests/sg-integration.test.ts`

**Step 1 — Write the failing test (or verify it passes)**
Update the Task 6 test to also check for the file header:
```ts
it("shows file header even for single-file results", async () => {
  const tool = await getSgTool();

  const result = await tool.execute(
    "test",
    { pattern: "export function $NAME($$$PARAMS): $RET { $$$BODY }", lang: "typescript", path: resolve(fixturesDir, "small.ts") },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  const text = getTextContent(result);
  expect(text).toContain("--- ");
  expect(text).toContain("small.ts ---");
});
```

**Step 2 — Run test, verify it passes**
Run: `npx vitest run tests/sg-integration.test.ts -t "shows file header even for single-file results"`
Expected: PASS — Task 7 implementation already emits headers for all files.

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 9: CLI args include lang when provided [depends: 3]
**Covers:** AC 5, 6

**Files:**
- Modify: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("passes -l flag when lang is provided", async () => {
  const tool = await getSgTool();
  const { vi } = await import("vitest");
  const cp = await import("child_process");

  let capturedArgs: string[] = [];
  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
    capturedArgs = args;
    cb(null, "[]", "");
    return {} as any;
  });

  await tool.execute("test", { pattern: "test($$$A)", lang: "python" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

  expect(capturedArgs).toContain("-l");
  expect(capturedArgs).toContain("python");

  vi.restoreAllMocks();
});

it("omits -l flag when lang is not provided", async () => {
  const tool = await getSgTool();
  const { vi } = await import("vitest");
  const cp = await import("child_process");

  let capturedArgs: string[] = [];
  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
    capturedArgs = args;
    cb(null, "[]", "");
    return {} as any;
  });

  await tool.execute("test", { pattern: "test($$$A)" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

  expect(capturedArgs).not.toContain("-l");

  vi.restoreAllMocks();
});
```

**Step 2 — Run test, verify they pass (already implemented)**
Run: `npx vitest run tests/sg.test.ts -t "passes -l flag when lang is provided"` and `npx vitest run tests/sg.test.ts -t "omits -l flag when lang is not provided"`
Expected: PASS — Task 3 implementation already conditionally adds `-l`.

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 10: Path resolution relative to cwd [depends: 3]
**Covers:** AC 7

**Files:**
- Modify: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("resolves path relative to ctx.cwd", async () => {
  const tool = await getSgTool();
  const { vi } = await import("vitest");
  const cp = await import("child_process");

  let capturedArgs: string[] = [];
  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
    capturedArgs = args;
    cb(null, "[]", "");
    return {} as any;
  });

  await tool.execute("test", { pattern: "test", path: "src" }, new AbortController().signal, () => {}, { cwd: "/my/project" });

  // Last arg should be the resolved path
  const lastArg = capturedArgs[capturedArgs.length - 1];
  expect(lastArg).toBe("/my/project/src");

  vi.restoreAllMocks();
});
```

**Step 2 — Run test, verify it passes (already implemented)**
Run: `npx vitest run tests/sg.test.ts -t "resolves path relative to ctx.cwd"`
Expected: PASS — Task 3 uses `resolveToCwd(params.path || ".", ctx.cwd)`.

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 11: Skip unreadable matched files silently [depends: 6]
**Covers:** AC 16

**Files:**
- Modify: `tests/sg.test.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("skips matches from unreadable files silently", async () => {
  const tool = await getSgTool();
  const { vi } = await import("vitest");
  const cp = await import("child_process");
  const fs = await import("fs/promises");

  const matches = [
    {
      file: "/does/not/exist.ts",
      range: { byteOffset: { start: 0, end: 0 }, start: { line: 0, column: 0 }, end: { line: 0, column: 10 } },
      text: "test",
      lines: "test",
    },
    {
      file: resolve(fixturesDir, "small.ts"),
      range: { byteOffset: { start: 0, end: 0 }, start: { line: 44, column: 0 }, end: { line: 44, column: 50 } },
      text: "export function createDemoDirectory(): UserDirectory {",
      lines: "export function createDemoDirectory(): UserDirectory {",
    },
  ];

  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, JSON.stringify(matches), "");
    return {} as any;
  });

  const result = await tool.execute("test", { pattern: "test" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

  expect(result.isError).toBeFalsy();
  const text = getTextContent(result);
  // Should have the small.ts match but not the missing file
  expect(text).toContain("small.ts");
  expect(text).not.toContain("/does/not/exist.ts");
});
```

**Step 2 — Run test, verify it passes (already implemented)**
Run: `npx vitest run tests/sg.test.ts -t "skips matches from unreadable files silently"`
Expected: PASS — Task 6 implementation has `if (!fileLines) continue;`.

Note: Need to import `resolve` and `fixturesDir` at the top of `tests/sg.test.ts`, or inline the path.

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 12: Edit compatibility — anchors from sg work with edit tool [depends: 6]
**Covers:** AC 17

**Files:**
- Modify: `tests/sg-integration.test.ts`
- Test: `tests/sg-integration.test.ts`

**Step 1 — Write the failing test**
```ts
it("hash anchors from sg output are valid for edit tool", async () => {
  const tool = await getSgTool();

  const result = await tool.execute(
    "test",
    { pattern: "export function $NAME($$$PARAMS): $RET { $$$BODY }", lang: "typescript", path: resolve(fixturesDir, "small.ts") },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  const text = getTextContent(result);
  const rows = parseHashlineRows(text);
  expect(rows.length).toBeGreaterThan(0);

  // Verify anchor can be used with applyHashlineEdits
  const { applyHashlineEdits } = await import("../src/hashline.js");
  const original = readFileSync(resolve(fixturesDir, "small.ts"), "utf-8");

  const edited = applyHashlineEdits(original, [
    { set_line: { anchor: rows[0].anchor, new_text: "// sg-anchor-test" } },
  ]);

  expect(edited.firstChangedLine).toBe(rows[0].line);
  expect(edited.content).toContain("// sg-anchor-test");
});
```

**Step 2 — Run test, verify it passes (already working)**
Run: `npx vitest run tests/sg-integration.test.ts -t "hash anchors from sg output are valid for edit tool"`
Expected: PASS — hashes are computed from real source lines using `computeLineHash`.

**Step 3 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 13: Create prompts/sg.md [depends: none]
**Covers:** AC 18

**Files:**
- Create: `prompts/sg.md`
- Modify: `tests/prompts-files.test.ts`
- Test: `tests/prompts-files.test.ts`

**Step 1 — Write the failing test**
Add to `tests/prompts-files.test.ts`:
```ts
it("prompts/sg.md exists", () => {
  expect(existsSync(resolve(promptsDir, "sg.md"))).toBe(true);
});

it("prompts/sg.md contains pattern syntax docs", () => {
  const content = readFileSync(resolve(promptsDir, "sg.md"), "utf-8");
  expect(content).toContain("$NAME");
  expect(content).toContain("$$$");
  expect(content).toContain("$_");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/prompts-files.test.ts -t "prompts/sg.md exists"`
Expected: FAIL — file doesn't exist.

**Step 3 — Write the prompt file**
Create `prompts/sg.md`:
```md
Structural code search using ast-grep. Finds AST patterns (not text strings), returns hashline-anchored results ready for the `edit` tool.

## Pattern Syntax

- `$NAME` — matches a single AST node (identifier, expression, type)
- `$$$ARGS` — matches zero or more nodes (function arguments, statements)
- `$_` — wildcard, matches any single node (use when you don't need to reference it)

## Common Patterns

| Pattern | What it finds |
|---------|---------------|
| `console.log($$$ARGS)` | All console.log calls |
| `function $NAME($$$PARAMS) { $$$BODY }` | All function declarations |
| `import $NAME from '$SOURCE'` | Default imports |
| `class $NAME { $$$BODY }` | Class declarations |
| `if ($COND) { $$$THEN }` | If statements |
| `$OBJ.$METHOD($$$ARGS)` | Method calls |

## Usage

- `sg({ pattern: "console.log($$$ARGS)" })` — search all files in cwd
- `sg({ pattern: "function $F($$$P)", lang: "typescript" })` — restrict to TypeScript
- `sg({ pattern: "$X === null", path: "src/" })` — search specific directory

## Output

Results are hashline-anchored (`>>LINE:HASH|content`), grouped by file. Use the anchors directly with the `edit` tool — no intermediate `read` needed.

## Workflow

1. `sg({ pattern: "console.log($$$ARGS)" })` — find all matches
2. Review the hashlined results
3. `edit({ path: "file.ts", edits: [{ set_line: { anchor: "42:ab", new_text: "..." } }] })` — edit directly using anchors from step 1
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/prompts-files.test.ts -t "prompts/sg.md exists"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 14: Load prompt as tool description [depends: 1, 13]
**Covers:** AC 19

**Files:**
- Modify: `src/sg.ts`
- Test: `tests/sg.test.ts`

**Step 1 — Write the failing test**
```ts
it("loads description from prompts/sg.md", async () => {
  const tool = await getSgTool();
  expect(tool.description).toContain("ast-grep");
  expect(tool.description).toContain("$NAME");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.test.ts -t "loads description from prompts/sg.md"`
Expected: FAIL — description is a hardcoded string without `$NAME`.

**Step 3 — Write minimal implementation**
In `src/sg.ts`, replace the hardcoded description:
```ts
import { readFileSync } from "fs";

const SG_DESC = readFileSync(new URL("../prompts/sg.md", import.meta.url), "utf-8").trim();

// In registerSgTool:
description: SG_DESC,
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.test.ts -t "loads description from prompts/sg.md"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

## Acceptance Criteria Coverage Matrix

| AC | Covered by Task(s) |
|---|---|
| 1 | 1 |
| 2 | 1 |
| 3 | 1 |
| 4 | 1 |
| 5 | 9 |
| 6 | 9 |
| 7 | 10 |
| 8 | 6 |
| 9 | 7, 8 |
| 10 | 6 |
| 11 | 6 |
| 12 | 6 |
| 13 | 5 |
| 14 | 3 |
| 15 | 4 |
| 16 | 11 |
| 17 | 12 |
| 18 | 13 |
| 19 | 14 |
| 20 | 2 |

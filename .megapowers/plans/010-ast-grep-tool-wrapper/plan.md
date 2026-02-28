# Plan: AST-Grep Tool Wrapper (M3)

## Project conventions (confirmed from repo)
- Language: TypeScript (ESM, `"type": "module"`)
- Tests: Vitest
- Full suite: `npm test`
- Tools are registered via `registerXTool(pi)` functions in `src/*.ts`, called from `index.ts`
- Prompt loading pattern: `readFileSync(new URL("../prompts/xxx.md", import.meta.url), "utf-8").trim()`

> Note: No `AGENTS.md` exists in this repo; conventions inferred from `package.json`, `index.ts`, and existing tests.

---

### Task 1: Register `sg` tool + schema (pattern required, lang/path optional) [depends: none]
**Covers:** AC 1, 2, 3, 4

**Files:**
- Create: `src/sg.ts`
- Create: `tests/sg.schema.test.ts`
- Test: `tests/sg.schema.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = {
    registerTool(def: any) {
      captured = def;
    },
  };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg tool schema", () => {
  it("registers name=sg and requires pattern only", async () => {
    const tool = await getSgTool();

    expect(tool.name).toBe("sg");
    expect(tool.parameters).toBeTruthy();

    expect(tool.parameters.properties.pattern.type).toBe("string");
    expect(tool.parameters.properties.lang.type).toBe("string");
    expect(tool.parameters.properties.path.type).toBe("string");

    expect(tool.parameters.required).toContain("pattern");
    expect(tool.parameters.required).not.toContain("lang");
    expect(tool.parameters.required).not.toContain("path");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.schema.test.ts -t "registers name=sg"`

Expected: FAIL — module not found, e.g. `Cannot find module '../src/sg.js'`.

**Step 3 — Write minimal implementation**
Create `src/sg.ts`:
```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export function registerSgTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "sg",
    label: "AST Grep",
    description: "Structural code search using ast-grep.",
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to search for" }),
      lang: Type.Optional(Type.String({ description: "Language hint for ast-grep (e.g. 'typescript')" })),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
    }),
    async execute() {
      return { content: [{ type: "text", text: "not implemented" }], details: {} };
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.schema.test.ts -t "registers name=sg"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 2: Wire `registerSgTool()` into `index.ts` [depends: 1]
**Covers:** AC 20

**Files:**
- Modify: `index.ts`
- Modify: `tests/entry-point.test.ts`
- Test: `tests/entry-point.test.ts`

**Step 1 — Write the failing test**
Append to `tests/entry-point.test.ts`:
```ts
// In tests/entry-point.test.ts, add this new test inside the existing
// describe("extension entry point (AC8)", ...) block (reuse existing imports + `root`).
it("registers sg tool", async () => {
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
  const tools: string[] = [];
  const mockPi = {
    registerTool(def: any) {
      tools.push(def.name);
    },
  };
    mod.default(mockPi as any);
  expect(tools).toContain("sg");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/entry-point.test.ts -t "registers sg tool"`
Expected: FAIL — assertion like `expected [..] to contain "sg"`.

**Step 3 — Write minimal implementation**
Modify `index.ts`:
```ts
import { registerSgTool } from "./src/sg.js";
```
and inside the default export:
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

### Task 3: Execute returns install hint when `sg` missing (ENOENT) [depends: 1]
**Covers:** AC 14

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg.execute-errors.test.ts`
- Test: `tests/sg.execute-errors.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.execute-errors.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("sg execute errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns helpful error when sg is not installed", async () => {
    const tool = await getSgTool();

    vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      const err: any = new Error("command not found: sg");
      err.code = "ENOENT";
      cb(err, "", "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "console.log($$$ARGS)" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("ast-grep (sg) is not installed. Run: brew install ast-grep");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.execute-errors.test.ts -t "sg is not installed"`
Expected: FAIL — `result.isError` is missing/false and/or text is `not implemented`.

**Step 3 — Write minimal implementation**
Modify `src/sg.ts` to use a spy-able `cp.execFile` and handle ENOENT:
```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as cp from "node:child_process";

type SgParams = { pattern: string; lang?: string; path?: string };

function execFileText(
  cmd: string,
  args: string[],
  opts: cp.ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    cp.execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        (err as any).stdout = stdout;
        (err as any).stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
      }
    });
  });
}

export function registerSgTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "sg",
    label: "AST Grep",
    description: "Structural code search using ast-grep.",
    parameters: Type.Object({
      pattern: Type.String({ description: "AST pattern to search for" }),
      lang: Type.Optional(Type.String({ description: "Language hint for ast-grep (e.g. 'typescript')" })),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const p = params as SgParams;
      const args = ["run", "--json", "-p", p.pattern, p.path ?? "."]; // path resolution added later

      try {
        const { stdout } = await execFileText("sg", args, {
          cwd: ctx.cwd,
          signal,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { content: [{ type: "text", text: stdout }], details: {} };
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          return {
            content: [{ type: "text", text: "ast-grep (sg) is not installed. Run: brew install ast-grep" }],
            isError: true,
            details: {},
          };
        }
        return {
          content: [{ type: "text", text: String(err?.message ?? err) }],
          isError: true,
          details: {},
        };
      }
    },
  });
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.execute-errors.test.ts -t "sg is not installed"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 4: Non-zero `sg` exit returns stderr text [depends: 3]
**Covers:** AC 15

**Files:**
- Modify: `src/sg.ts`
- Modify: `tests/sg.execute-errors.test.ts`
- Test: `tests/sg.execute-errors.test.ts`

**Step 1 — Write the failing test**
Append to `tests/sg.execute-errors.test.ts`:
```ts
it("returns stderr when sg exits non-zero", async () => {
  const tool = await getSgTool();

  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    const err: any = new Error("sg failed");
    err.code = 2;
    cb(err, "", "Error: invalid pattern");
    return {} as any;
  });

  const result = await tool.execute(
    "tc",
    { pattern: "{{bad" },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  expect(result.isError).toBe(true);
  expect(text(result)).toContain("invalid pattern");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.execute-errors.test.ts -t "exits non-zero"`
Expected: FAIL — text is currently `sg failed` (err.message) instead of stderr.

**Step 3 — Write minimal implementation**
In `src/sg.ts` change the non-ENOENT error return to prefer stderr:
```ts
return {
  content: [{ type: "text", text: String(err?.stderr || err?.message || err) }],
  isError: true,
  details: {},
};
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.execute-errors.test.ts -t "exits non-zero"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 5: CLI args include `-l <lang>` only when `lang` is provided [depends: 3]
**Covers:** AC 5, 6

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg.args.test.ts`
- Test: `tests/sg.args.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.args.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg cli args", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds -l when lang is provided and omits it otherwise", async () => {
    const tool = await getSgTool();

    const calls: string[][] = [];
    vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute("tc", { pattern: "p", lang: "python" }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await tool.execute("tc", { pattern: "p" }, new AbortController().signal, () => {}, { cwd: process.cwd() });

    expect(calls[0]).toContain("-l");
    expect(calls[0]).toContain("python");
    expect(calls[1]).not.toContain("-l");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.args.test.ts -t "adds -l"`
Expected: FAIL — first call args do not include `-l`.

**Step 3 — Write minimal implementation**
In `src/sg.ts`, build args like:
```ts
const args = ["run", "--json", "-p", p.pattern];
if (p.lang) args.push("-l", p.lang);
args.push(p.path ?? ".");
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.args.test.ts -t "adds -l"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 6: Resolve `path` relative to `ctx.cwd` [depends: 3]
**Covers:** AC 7

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg.path-resolution.test.ts`
- Test: `tests/sg.path-resolution.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.path-resolution.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg path resolution", () => {
  afterEach(() => vi.restoreAllMocks());

  it("resolves params.path relative to ctx.cwd", async () => {
    const tool = await getSgTool();

    let capturedArgs: string[] = [];
    vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      capturedArgs = args;
      cb(null, "[]", "");
      return {} as any;
    });

    await tool.execute(
      "tc",
      { pattern: "p", path: "src" },
      new AbortController().signal,
      () => {},
      { cwd: "/my/project" },
    );

    expect(capturedArgs[capturedArgs.length - 1]).toBe("/my/project/src");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.path-resolution.test.ts -t "relative to ctx.cwd"`
Expected: FAIL — last arg is `src` (unresolved) instead of `/my/project/src`.

**Step 3 — Write minimal implementation**
In `src/sg.ts`:
- Import `resolveToCwd` from `./path-utils.js`
- Replace `args.push(p.path ?? ".")` with:
```ts
const searchPath = resolveToCwd(p.path ?? ".", ctx.cwd);
args.push(searchPath);
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.path-resolution.test.ts -t "relative to ctx.cwd"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 7: Parse sg JSON and return no-match message for `[]` [depends: 3]
**Covers:** AC 13

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg.no-match.test.ts`
- Test: `tests/sg.no-match.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.no-match.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("sg no-match", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a friendly message when sg returns []", async () => {
    const tool = await getSgTool();

    vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "[]", "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "nonExistentPattern" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe("No matches found for pattern: nonExistentPattern");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.no-match.test.ts -t "friendly message"`
Expected: FAIL — tool returns raw `[]` instead of the message.

**Step 3 — Write minimal implementation**
In `src/sg.ts`, after capturing `stdout`, parse JSON:
```ts
const matches = JSON.parse(stdout);
if (!Array.isArray(matches) || matches.length === 0) {
  return {
    content: [{ type: "text", text: `No matches found for pattern: ${p.pattern}` }],
    details: {},
  };
}

// formatting added later
return { content: [{ type: "text", text: stdout }], details: {} };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.no-match.test.ts -t "friendly message"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 8: Format a multi-line match as `>>LINE:HASH|content` using real file lines + edit compatibility [depends: 6, 7]
**Covers:** AC 8, 10, 11, 12, 17

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg.format.test.ts`
- Test: `tests/sg.format.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.format.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function parseAnchors(block: string): Array<{ line: number; hash: string; anchor: string; content: string }> {
  const out: Array<{ line: number; hash: string; anchor: string; content: string }> = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^>>(\d+):([0-9a-f]{2})\|(.*)$/);
    if (!m) continue;
    out.push({
      line: Number(m[1]),
      hash: m[2],
      anchor: `${m[1]}:${m[2]}`,
      content: m[3],
    });
  }
  return out;
}

describe("sg formatting", () => {
  afterEach(() => vi.restoreAllMocks());

  it("formats match lines with correct 1-indexed hashlines and anchors apply via hashline engine", async () => {
    const tool = await getSgTool();

    const absSmallTs = resolve(fixturesDir, "small.ts");

    // createDemoDirectory() spans lines 45-49 in tests/fixtures/small.ts
    const mockedMatches = [
      {
        file: absSmallTs,
        range: { start: { line: 44, column: 0 }, end: { line: 48, column: 0 } },
        text: "",
        lines: "",
      },
    ];

    vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify(mockedMatches), "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "export function $NAME($$$PARAMS) { $$$BODY }", path: absSmallTs },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();

    const out = text(result);
    expect(out).toContain("---");

    const anchors = parseAnchors(out);
    expect(anchors.length).toBe(5);
    expect(anchors[0].line).toBe(45);
    expect(anchors[4].line).toBe(49);
    expect(anchors[0].content).toContain("export function createDemoDirectory");

    const { computeLineHash, applyHashlineEdits } = await import("../src/hashline.js");
    const fileLines = readFileSync(absSmallTs, "utf-8").split("\n");

    for (const a of anchors) {
      expect(a.hash).toBe(computeLineHash(a.line, fileLines[a.line - 1] ?? ""));
    }

    const original = readFileSync(absSmallTs, "utf-8");
    const edited = applyHashlineEdits(original, [
      { set_line: { anchor: anchors[0].anchor, new_text: "// sg-anchor-test" } },
    ]);

    expect(edited.firstChangedLine).toBe(45);
    expect(edited.content).toContain("// sg-anchor-test");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.format.test.ts -t "formats match lines"`
Expected: FAIL — output is still raw JSON (no `---` header / no `>>LINE:HASH|`).

**Step 3 — Write minimal implementation**
In `src/sg.ts` (after `matches` JSON parse and non-empty check):
- Read the real source file contents
- Compute hashes using `computeLineHash(lineNumber, sourceLine)`
- Convert 0-indexed range lines to 1-indexed output lines
- Always emit a file header before matches

Minimal code to add:
```ts
import path from "node:path";
import { stat as fsStat, readFile as fsReadFile } from "node:fs/promises";
import { normalizeToLF, stripBom } from "./edit-diff.js";
import { computeLineHash } from "./hashline.js";

type SgMatch = {
  file: string;
  range: { start: { line: number; column: number }; end: { line: number; column: number } };
};

const searchPathIsDirectory = await fsStat(searchPath).then((s) => s.isDirectory()).catch(() => false);

const fileCache = new Map<string, string[]>();
const getFileLines = async (absolutePath: string): Promise<string[] | undefined> => {
  if (fileCache.has(absolutePath)) return fileCache.get(absolutePath);
  try {
    const raw = (await fsReadFile(absolutePath)).toString("utf-8");
    const lines = normalizeToLF(stripBom(raw).text).split("\n");
    fileCache.set(absolutePath, lines);
    return lines;
  } catch {
    fileCache.set(absolutePath, []);
    return undefined;
  }
};

const toAbsoluteFile = (m: SgMatch): string => {
  if (path.isAbsolute(m.file)) return m.file;
  if (searchPathIsDirectory) return path.resolve(searchPath, m.file);
  return searchPath; // searchPath is a file
};

const blocks: string[] = [];
for (const m of matches as SgMatch[]) {
  const abs = toAbsoluteFile(m);
  const display = path.relative(ctx.cwd, abs);
  const lines = await getFileLines(abs);
  if (!lines) continue;

  blocks.push(`--- ${display} ---`);
  const start = m.range.start.line + 1;
  const end = m.range.end.line + 1;
  for (let ln = start; ln <= end; ln++) {
    const srcLine = lines[ln - 1] ?? "";
    blocks.push(`>>${ln}:${computeLineHash(ln, srcLine)}|${srcLine}`);
  }
}

if (blocks.length === 0) {
  return { content: [{ type: "text", text: `No matches found for pattern: ${p.pattern}` }], details: {} };
}

return { content: [{ type: "text", text: blocks.join("\n") }], details: {} };
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.format.test.ts -t "formats match lines"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 9: Group multiple files with `--- file ---` headers (one header per file) [depends: 8]
**Covers:** AC 9

**Files:**
- Modify: `src/sg.ts`
- Modify: `tests/sg.format.test.ts`
- Test: `tests/sg.format.test.ts`

**Step 1 — Write the failing test**
Append to `tests/sg.format.test.ts`:
```ts
it("groups output by file with one header per file", async () => {
  const tool = await getSgTool();

  const absSmallTs = resolve(fixturesDir, "small.ts");
  const absPlain = resolve(fixturesDir, "plain.txt");

  const mockedMatches = [
    { file: absSmallTs, range: { start: { line: 44, column: 0 }, end: { line: 44, column: 0 } } },
    { file: absPlain, range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
  ];

  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, JSON.stringify(mockedMatches), "");
    return {} as any;
  });

  const result = await tool.execute(
    "tc",
    { pattern: "p", path: fixturesDir },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  const out = text(result);
  const headers = out.split("\n").filter((l) => l.startsWith("--- "));
  expect(headers.length).toBe(2);
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.format.test.ts -t "groups output by file"`
Expected: FAIL — current implementation emits a header for every match (duplicate headers for same file) or doesn’t stabilize grouping.

**Step 3 — Write minimal implementation**
In `src/sg.ts`:
- Group matches by `display` file path using a `Map<string, SgMatch[]>` (Map preserves insertion order)
- Emit exactly one header per file, then the lines for all matches in that file

Minimal change sketch:
```ts
const grouped = new Map<string, { abs: string; matches: SgMatch[] }>();
for (const m of matches as SgMatch[]) {
  const abs = toAbsoluteFile(m);
  const display = path.relative(ctx.cwd, abs);
  const bucket = grouped.get(display);
  if (bucket) bucket.matches.push(m);
  else grouped.set(display, { abs, matches: [m] });
}

const blocks: string[] = [];
for (const [display, { abs, matches: fileMatches }] of grouped) {
  const lines = await getFileLines(abs);
  if (!lines) continue;

  blocks.push(`--- ${display} ---`);
  for (const m of fileMatches) {
    const start = m.range.start.line + 1;
    const end = m.range.end.line + 1;
    for (let ln = start; ln <= end; ln++) {
      const srcLine = lines[ln - 1] ?? "";
      blocks.push(`>>${ln}:${computeLineHash(ln, srcLine)}|${srcLine}`);
    }
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.format.test.ts -t "groups output by file"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 10: Skip unreadable matched files silently [depends: 9]
**Covers:** AC 16

**Files:**
- Modify: `tests/sg.format.test.ts`
- Test: `tests/sg.format.test.ts`

**Step 1 — Write the failing test**
Append to `tests/sg.format.test.ts`:
```ts
it("skips matches from unreadable files without error", async () => {
  const tool = await getSgTool();

  const absSmallTs = resolve(fixturesDir, "small.ts");

  const mockedMatches = [
    { file: "/does/not/exist.ts", range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
    { file: absSmallTs, range: { start: { line: 44, column: 0 }, end: { line: 44, column: 0 } } },
  ];

  vi.spyOn(cp, "execFile").mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(null, JSON.stringify(mockedMatches), "");
    return {} as any;
  });

  const result = await tool.execute(
    "tc",
    { pattern: "p", path: fixturesDir },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  expect(result.isError).toBeFalsy();
  const out = text(result);
  expect(out).toContain("small.ts");
  expect(out).not.toContain("/does/not/exist.ts");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.format.test.ts -t "unreadable files"`
Expected: FAIL — output includes a header for `/does/not/exist.ts` or tool errors.

**Step 3 — Write minimal implementation**
In `src/sg.ts`, ensure you only emit a file header after the file was successfully read. Minimal change (in the grouped loop from Task 9):

```ts
for (const [display, { abs, matches: fileMatches }] of grouped) {
  const lines = await getFileLines(abs);
  if (!lines) continue; // skip unreadable/missing files silently

  blocks.push(`--- ${display} ---`);

  for (const m of fileMatches) {
    const start = m.range.start.line + 1;
    const end = m.range.end.line + 1;
    for (let ln = start; ln <= end; ln++) {
      const srcLine = lines[ln - 1] ?? "";
      blocks.push(`>>${ln}:${computeLineHash(ln, srcLine)}|${srcLine}`);
    }
  }
}
```
**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.format.test.ts -t "unreadable files"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 11: Add `prompts/sg.md` and validate required metavariable docs [depends: none]
**Covers:** AC 18

**Files:**
- Create: `prompts/sg.md`
- Modify: `tests/prompts-files.test.ts`
- Test: `tests/prompts-files.test.ts`

**Step 1 — Write the failing test**
Append to `tests/prompts-files.test.ts` (single test for AC18):
```ts
it("sg prompt exists and documents metavariables and workflow", () => {
  const sgPromptPath = resolve(root, "prompts/sg.md");
  expect(existsSync(sgPromptPath)).toBe(true);

  const content = readFileSync(sgPromptPath, "utf8");
  expect(content).toContain("$NAME");
  expect(content).toContain("$$$ARGS");
  expect(content).toContain("$_");
  expect(content.toLowerCase()).toContain("workflow");
  expect(content.toLowerCase()).toContain("edit");
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/prompts-files.test.ts -t "sg prompt exists"`
Expected: FAIL — `prompts/sg.md` does not exist.

**Step 3 — Write minimal implementation**
Create `prompts/sg.md`:
```md
Structural code search using **ast-grep** (`sg`). This tool finds code by **AST structure** (not raw text) and returns **hashline-anchored** results ready for the `edit` tool.

## Pattern Syntax (metavariables)

- `$NAME` — matches a single AST node
- `$$$ARGS` — matches zero or more nodes (variadic)
- `$_` — wildcard (matches any single node)

## Common Patterns

- `console.log($$$ARGS)` — all console.log calls
- `export function $NAME($$$PARAMS) { $$$BODY }` — exported function declarations
- `$OBJ.$METHOD($$$ARGS)` — method calls
- `import $NAME from '$SOURCE'` — default imports

## Workflow: search → edit

1. Run `sg({ pattern: "console.log($$$ARGS)" })`
2. Review output grouped by file (`--- path ---`) with anchors (`>>LINE:HASH|...`)
3. Use anchors directly with `edit({ path: "file.ts", edits: [{ set_line: { anchor: "42:ab", new_text: "..." } }] })`
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/prompts-files.test.ts -t "sg prompt exists"`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `npm test`
Expected: all passing

---

### Task 12: Load `prompts/sg.md` as the tool description [depends: 1, 11]
**Covers:** AC 19

**Files:**
- Modify: `src/sg.ts`
- Create: `tests/sg.prompt-loading.test.ts`
- Test: `tests/sg.prompt-loading.test.ts`

**Step 1 — Write the failing test**
Create `tests/sg.prompt-loading.test.ts`:
```ts
import { describe, it, expect } from "vitest";

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

describe("sg prompt loading", () => {
  it("uses prompts/sg.md as tool description", async () => {
    const tool = await getSgTool();
    expect(tool.description).toContain("ast-grep");
    expect(tool.description).toContain("$NAME");
  });
});
```

**Step 2 — Run test, verify it fails**
Run: `npx vitest run tests/sg.prompt-loading.test.ts -t "uses prompts/sg.md"`
Expected: FAIL — current description is the hardcoded string and does not include `$NAME`.

**Step 3 — Write minimal implementation**
Modify `src/sg.ts`:
```ts
import { readFileSync } from "node:fs";

const SG_DESC = readFileSync(new URL("../prompts/sg.md", import.meta.url), "utf-8").trim();
```
Then in tool registration:
```ts
description: SG_DESC,
```

**Step 4 — Run test, verify it passes**
Run: `npx vitest run tests/sg.prompt-loading.test.ts -t "uses prompts/sg.md"`
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
| 5 | 5 |
| 6 | 5 |
| 7 | 6 |
| 8 | 8 |
| 9 | 9 |
| 10 | 8 |
| 11 | 8 |
| 12 | 8 |
| 13 | 7 |
| 14 | 3 |
| 15 | 4 |
| 16 | 10 |
| 17 | 8 |
| 18 | 11 |
| 19 | 12 |
| 20 | 2 |

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isFdAvailable, _testable } from "../src/find.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures/find-basic");
const _originalIsFdAvailable = isFdAvailable;

async function getFindTool() {
  const { registerFindTool } = await import("../src/find.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerFindTool(mockPi as any);
  if (!captured) throw new Error("find tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("find core", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("registers with name 'find' and correct schema", async () => {
    const tool = await getFindTool();
    expect(tool.name).toBe("find");
    const schema = tool.parameters;
    expect(schema.properties.pattern).toBeDefined();
    expect(schema.properties.path).toBeDefined();
    expect(schema.properties.limit).toBeDefined();
    expect(schema.properties.type).toBeDefined();
    expect(schema.properties.maxDepth).toBeDefined();
    // pattern is required, others optional
    expect(schema.required).toContain("pattern");
    expect(Object.keys(schema.properties)).toHaveLength(5);
  });

  it("finds files matching glob pattern with fallback, sorted and relative", async () => {
    // Force fallback by mocking isFdAvailable
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output = text(result);
    // Should contain both .ts files, sorted by relative path
    expect(output).toContain("src/app.ts");
    expect(output).toContain("src/utils/helper.ts");
    // Should NOT contain .md files
    expect(output).not.toContain("README.md");
    expect(output).not.toContain("guide.md");

    // Paths should use forward slashes
    const lines = output.split("\n").filter((l: string) => l.length > 0 && !l.startsWith("["));
    for (const line of lines) {
      if (line.startsWith("Hint")) continue;
      expect(line).not.toContain("\\");
    }

    // Verify sorted order
    const paths = lines.filter((l: string) => !l.startsWith("[") && !l.startsWith("Hint"));
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i].localeCompare(paths[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns correct ptcValue shape", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const ptc = result.details?.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.tool).toBe("find");
    expect(ptc.pattern).toBe("*.ts");
    expect(ptc.totalEntries).toBe(2);
    expect(ptc.truncated).toBe(false);
    expect(ptc.entries).toHaveLength(2);
    // Entries should have path and type
    for (const entry of ptc.entries) {
      expect(entry.path).toBeDefined();
      expect(entry.type).toBe("file");
    }
  });

  it("includes hidden files by default", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*hidden*" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output = text(result);
    expect(output).toContain(".hidden-file");
  });

  it("returns relative paths from cwd with forward slashes", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*.md" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const ptc = result.details?.ptcValue;
    for (const entry of ptc.entries) {
      // Must be relative (no leading /)
      expect(entry.path.startsWith("/")).toBe(false);
      // Must use forward slashes
      expect(entry.path).not.toContain("\\");
    }
  });
});

describe("find type filtering", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("type 'dir' returns only directories", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*", type: "dir" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const ptc = result.details?.ptcValue;
    expect(ptc.entries.length).toBeGreaterThan(0);
    for (const entry of ptc.entries) {
      expect(entry.type).toBe("dir");
    }
    // Should include src, docs, src/utils
    const paths = ptc.entries.map((e: any) => e.path);
    expect(paths).toContain("src");
    expect(paths).toContain("docs");
    expect(paths).toContain("src/utils");
  });

  it("type 'any' returns both files and directories", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*", type: "any" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const ptc = result.details?.ptcValue;
    const types = new Set(ptc.entries.map((e: any) => e.type));
    expect(types.has("file")).toBe(true);
    expect(types.has("dir")).toBe(true);
  });

  it("type 'any' shows directories with / suffix in text output", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "src", type: "any" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output = text(result);
    expect(output).toContain("src/");
  });
});

describe("find maxDepth", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("maxDepth 1 returns only top-level files", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*", maxDepth: 1 },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const ptc = result.details?.ptcValue;
    // Should find top-level files: README.md, .hidden-file
    // Should NOT find src/app.ts, src/utils/helper.ts, docs/guide.md
    for (const entry of ptc.entries) {
      expect(entry.path).not.toContain("/");
    }
    const paths = ptc.entries.map((e: any) => e.path);
    expect(paths).toContain("README.md");
    expect(paths).toContain(".hidden-file");
    expect(paths).not.toContain("src/app.ts");
  });

  it("maxDepth 2 includes one level of nesting", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*.ts", maxDepth: 2 },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const ptc = result.details?.ptcValue;
    const paths = ptc.entries.map((e: any) => e.path);
    // src/app.ts is depth 2 — should be included
    expect(paths).toContain("src/app.ts");
    // src/utils/helper.ts is depth 3 — should be excluded
    expect(paths).not.toContain("src/utils/helper.ts");
  });
});

describe("find limit truncation", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("truncates at limit and appends notice", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*", type: "any", limit: 2 },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output = text(result);
    expect(output).toContain("more entries");
    expect(output).toContain("refine pattern");

    const ptc = result.details?.ptcValue;
    expect(ptc.truncated).toBe(true);
    expect(ptc.entries).toHaveLength(2);
    expect(ptc.totalEntries).toBeGreaterThan(2);
  });
});

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("find byte-budget truncation", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("truncates at 50 KB with notice", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    // Create a temp dir with many files that produce >50KB of paths
    const bigDir = mkdtempSync(join(tmpdir(), "find-bigdir-"));
    try {
      for (let i = 0; i < 600; i++) {
        const name = `file-${"x".repeat(80)}-${String(i).padStart(4, "0")}.txt`;
        writeFileSync(join(bigDir, name), "");
      }

      const result = await tool.execute(
        "tc",
        { pattern: "*.txt", limit: 10000 },
        new AbortController().signal,
        undefined,
        { cwd: bigDir },
      );

      const output = text(result);
      expect(output).toContain("truncated at 50 KB");
      expect(Buffer.byteLength(output, "utf8")).toBeLessThan(55 * 1024);
    } finally {
      rmSync(bigDir, { recursive: true, force: true });
    }
  });
});

describe("find empty results", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("returns clean message when no files match", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*.nonexistent-extension-xyz" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output = text(result);
    expect(output).toContain("No files found matching pattern");
    expect(result.isError).toBeUndefined();

    const ptc = result.details?.ptcValue;
    expect(ptc.totalEntries).toBe(0);
    expect(ptc.entries).toHaveLength(0);
    expect(ptc.truncated).toBe(false);
  });
});

describe("find gitignore respect", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  const gitignoreDir = resolve(__dirname, "fixtures/find-gitignore");

  it("excludes files matching root .gitignore patterns", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*", type: "any" },
      new AbortController().signal,
      undefined,
      { cwd: gitignoreDir },
    );

    const ptc = result.details?.ptcValue;
    const paths = ptc.entries.map((e: any) => e.path);

    // included.ts should be present
    expect(paths).toContain("included.ts");
    // ignored.log should be excluded (*.log in .gitignore)
    expect(paths).not.toContain("ignored.log");
    // build/ and contents should be excluded
    expect(paths.some((p: string) => p.startsWith("build"))).toBe(false);
  });

  it("respects nested .gitignore files", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const result = await tool.execute(
      "tc",
      { pattern: "*", type: "any" },
      new AbortController().signal,
      undefined,
      { cwd: gitignoreDir },
    );

    const ptc = result.details?.ptcValue;
    const paths = ptc.entries.map((e: any) => e.path);

    // sub/kept.ts should be present
    expect(paths).toContain("sub/kept.ts");
    // sub/temp.tmp should be excluded (*.tmp in sub/.gitignore)
    expect(paths).not.toContain("sub/temp.tmp");
  });
});

import { execFileSync } from "node:child_process";

function isFdInstalled(): boolean {
  try {
    execFileSync("fd", ["--version"], { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("find fd backend", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it.skipIf(!isFdInstalled())("uses fd when available and produces same results as fallback", async () => {

    // Run with fd
    _testable.isFdAvailable = () => true;
    const tool = await getFindTool();
    const fdResult = await tool.execute(
      "tc",
      { pattern: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    // Run with fallback
    _testable.isFdAvailable = () => false;
    const fallbackResult = await tool.execute(
      "tc",
      { pattern: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    // Both should return the same entries (same paths, same order)
    const fdEntries = fdResult.details?.ptcValue.entries;
    const fallbackEntries = fallbackResult.details?.ptcValue.entries;
    expect(fdEntries).toEqual(fallbackEntries);
  });
});

describe("find fd hint", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("shows install hint on first call when fd is unavailable, not on second", async () => {
    _testable.isFdAvailable = () => false;

    // Reset the hint flag for this test
    _testable.fdHintShown = false;

    const tool = await getFindTool();

    const result1 = await tool.execute(
      "tc",
      { pattern: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output1 = text(result1);
    expect(output1).toContain("Install fd for faster file discovery");
    expect(output1).toContain("brew install fd");

    // Second call should NOT show the hint
    const result2 = await tool.execute(
      "tc2",
      { pattern: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: fixturesDir },
    );

    const output2 = text(result2);
    expect(output2).not.toContain("Install fd for faster file discovery");
  });
});

describe("find determinism", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("produces identical output on two consecutive calls", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const params = { pattern: "*.ts" };
    const signal = new AbortController().signal;
    const ctx = { cwd: fixturesDir };

    const result1 = await tool.execute("tc1", params, signal, undefined, ctx);
    const result2 = await tool.execute("tc2", params, signal, undefined, ctx);

    expect(text(result1)).toBe(text(result2));
    expect(result1.details.ptcValue.entries).toEqual(result2.details.ptcValue.entries);
  });
});

import { Text } from "@mariozechner/pi-tui";

describe("find TUI renderers", () => {
  it("renderCall returns a Text object", async () => {
    const tool = await getFindTool();
    const theme = { fg: (_style: string, text: string) => text };
    const result = tool.renderCall({ pattern: "*.ts", path: "src" }, theme);
    expect(result).toBeInstanceOf(Text);
  });

  it("renderResult returns a Text object", async () => {
    const tool = await getFindTool();
    const theme = { fg: (_style: string, text: string) => text };
    const mockResult = {
      content: [{ type: "text", text: "src/app.ts\nsrc/utils/helper.ts" }],
    };
    const result = tool.renderResult(mockResult, {}, theme);
    expect(result).toBeInstanceOf(Text);
  });
});

import { readFileSync } from "node:fs";

describe("find index.ts registration", () => {
  it("index.ts imports and calls registerFindTool", () => {
    const root = resolve(__dirname, "..");
    const source = readFileSync(resolve(root, "index.ts"), "utf8");
    expect(source).toContain('import { registerFindTool } from "./src/find.js"');
    expect(source).toContain("registerFindTool(pi)");
  });

  it("extension entry point registers find tool", async () => {
    const { pathToFileURL } = await import("node:url");
    const root = resolve(__dirname, "..");
    const mod = await import(pathToFileURL(resolve(root, "index.ts")).href);
    const tools: string[] = [];
    const mockPi = {
      registerTool(def: any) { tools.push(def.name); },
      on() {},
      events: { emit() {}, on() {} },
    };
    mod.default(mockPi as any);
    expect(tools).toContain("find");
  });
});

describe("find path resolution", () => {
  afterEach(() => { vi.restoreAllMocks(); _testable.isFdAvailable = _originalIsFdAvailable; });

  it("resolves relative path via resolveToCwd against ctx.cwd", async () => {
    _testable.isFdAvailable = () => false;

    const tool = await getFindTool();
    const parentDir = resolve(fixturesDir, "..");
    const result = await tool.execute(
      "tc",
      { pattern: "*.ts", path: "find-basic" },
      new AbortController().signal,
      undefined,
      { cwd: parentDir },
    );

    const ptc = result.details?.ptcValue;
    expect(ptc.totalEntries).toBe(2);
    expect(result.isError).toBeUndefined();
  });
});

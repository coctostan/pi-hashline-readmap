import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures/ls-basic");

async function getLsTool() {
  const { registerLsTool } = await import("../src/ls.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerLsTool(mockPi as any);
  if (!captured) throw new Error("ls tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("ls core", () => {
  it("registers with name 'ls' and 3-param schema", async () => {
    const tool = await getLsTool();
    expect(tool.name).toBe("ls");
    const schema = tool.parameters;
    expect(schema.properties.path).toBeDefined();
    expect(schema.properties.limit).toBeDefined();
    expect(schema.properties.glob).toBeDefined();
    // Exactly 3 params — no others
    expect(Object.keys(schema.properties)).toHaveLength(3);
  });

  it("lists dirs first with / suffix, then files, case-insensitive sorted", async () => {
    const tool = await getLsTool();
    const result = await tool.execute(
      "tc", { path: fixturesDir }, new AbortController().signal, undefined, { cwd: process.cwd() },
    );

    const output = text(result);
    const lines = output.split("\n").filter((l: string) => l.length > 0 && !l.startsWith("["));
    // sub-dir/ should come first (only dir), then files alpha-sorted
    expect(lines[0]).toBe("sub-dir/");
    // case-insensitive: .hidden, Apple.ts, banana.ts
    expect(lines[1]).toBe(".hidden");
    expect(lines[2]).toBe("Apple.ts");
    expect(lines[3]).toBe("banana.ts");
  });

  it("returns correct ptcValue shape", async () => {
    const tool = await getLsTool();
    const result = await tool.execute(
      "tc", { path: fixturesDir }, new AbortController().signal, undefined, { cwd: process.cwd() },
    );

    const ptc = result.details?.ptcValue;
    expect(ptc).toBeDefined();
    expect(ptc.tool).toBe("ls");
    expect(ptc.path).toBe(fixturesDir);
    expect(ptc.totalEntries).toBe(4);
    expect(ptc.truncated).toBe(false);
    expect(ptc.entries).toHaveLength(4);
    // First entry is the dir
    expect(ptc.entries[0]).toEqual({ name: "sub-dir", type: "dir" });
    // Files follow
    expect(ptc.entries[1]).toEqual({ name: ".hidden", type: "file" });
    expect(ptc.entries[2]).toEqual({ name: "Apple.ts", type: "file" });
    expect(ptc.entries[3]).toEqual({ name: "banana.ts", type: "file" });
  });

  it("includes dotfiles without any toggle", async () => {
    const tool = await getLsTool();
    const result = await tool.execute(
      "tc", { path: fixturesDir }, new AbortController().signal, undefined, { cwd: process.cwd() },
    );
    const output = text(result);
    expect(output).toContain(".hidden");
  });
});

describe("ls errors", () => {
  it("returns isError for non-existent path", async () => {
    const tool = await getLsTool();
    const result = await tool.execute(
      "tc",
      { path: "/tmp/this-path-does-not-exist-ls-test-xyz" },
      new AbortController().signal,
      undefined,
      { cwd: process.cwd() },
    );
    expect(result.isError).toBe(true);
    const output = text(result);
    expect(output).toContain("does not exist");
  });

  it("returns isError with read hint when path is a file", async () => {
    const tool = await getLsTool();
    const filePath = resolve(fixturesDir, "Apple.ts");
    const result = await tool.execute(
      "tc",
      { path: filePath },
      new AbortController().signal,
      undefined,
      { cwd: process.cwd() },
    );
    expect(result.isError).toBe(true);
    const output = text(result);
    expect(output).toContain("is a file, not a directory");
    expect(output).toContain("read");
  });
});

describe("ls empty directory", () => {
  it("returns '(empty directory)' for an empty dir", async () => {
    const tool = await getLsTool();
    const emptyDir = mkdtempSync(join(tmpdir(), "ls-empty-"));
    try {
      const result = await tool.execute(
        "tc",
        { path: emptyDir },
        new AbortController().signal,
        undefined,
        { cwd: process.cwd() },
      );
      const output = text(result);
      expect(output).toBe("(empty directory)");
      expect(result.isError).toBeUndefined();
      const ptc = result.details?.ptcValue;
      expect(ptc.totalEntries).toBe(0);
      expect(ptc.entries).toHaveLength(0);
      expect(ptc.truncated).toBe(false);
    } finally {
      rmdirSync(emptyDir);
    }
  });
});

describe("ls glob filtering", () => {
  it("filters entries by glob pattern", async () => {
    const tool = await getLsTool();
    const result = await tool.execute(
      "tc",
      { path: fixturesDir, glob: "*.ts" },
      new AbortController().signal,
      undefined,
      { cwd: process.cwd() },
    );

    const output = text(result);
    // Only .ts files should appear, no dirs, no .hidden
    expect(output).toContain("Apple.ts");
    expect(output).toContain("banana.ts");
    expect(output).not.toContain("sub-dir");
    expect(output).not.toContain(".hidden");

    const ptc = result.details?.ptcValue;
    expect(ptc.totalEntries).toBe(2);
    expect(ptc.entries).toHaveLength(2);
    expect(ptc.entries.every((e: any) => e.name.endsWith(".ts"))).toBe(true);
  });

  it("glob also matches directory names", async () => {
    const tool = await getLsTool();
    const result = await tool.execute(
      "tc",
      { path: fixturesDir, glob: "sub-*" },
      new AbortController().signal,
      undefined,
      { cwd: process.cwd() },
    );

    const ptc = result.details?.ptcValue;
    expect(ptc.totalEntries).toBe(1);
    expect(ptc.entries[0]).toEqual({ name: "sub-dir", type: "dir" });
  });
});

describe("ls limit truncation", () => {
  it("truncates at limit and appends notice", async () => {
    const tool = await getLsTool();
    // ls-basic has 4 entries (sub-dir, .hidden, Apple.ts, banana.ts)
    const result = await tool.execute(
      "tc",
      { path: fixturesDir, limit: 2 },
      new AbortController().signal,
      undefined,
      { cwd: process.cwd() },
    );

    const output = text(result);
    // Should show only 2 entries + truncation notice
    const lines = output.split("\n").filter((l: string) => l.length > 0);
    // 2 entries + 1 truncation notice
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("2 more entries");
    expect(lines[2]).toContain("glob");

    const ptc = result.details?.ptcValue;
    expect(ptc.truncated).toBe(true);
    expect(ptc.totalEntries).toBe(4);
    expect(ptc.entries).toHaveLength(2);
  });
});

describe("ls byte-budget truncation", () => {
  it("truncates at 50 KB with notice", async () => {
    const tool = await getLsTool();
    // Create a temp dir with many entries that exceed 50 KB total
    const bigDir = mkdtempSync(join(tmpdir(), "ls-bigdir-"));
    try {
      // Create 600 files with long names (each ~100 chars = ~60KB total)
      for (let i = 0; i < 600; i++) {
        const name = `file-${"x".repeat(90)}-${String(i).padStart(4, "0")}.txt`;
        writeFileSync(join(bigDir, name), "");
      }

      const result = await tool.execute(
        "tc",
        { path: bigDir },
        new AbortController().signal,
        undefined,
        { cwd: process.cwd() },
      );

      const output = text(result);
      expect(output).toContain("truncated at 50 KB");
      expect(Buffer.byteLength(output, "utf8")).toBeLessThan(55 * 1024); // some tolerance for the notice
    } finally {
      rmSync(bigDir, { recursive: true, force: true });
    }
  });
});

describe("ls determinism", () => {
  it("produces identical output on two consecutive calls", async () => {
    const tool = await getLsTool();
    const params = { path: fixturesDir };
    const signal = new AbortController().signal;
    const ctx = { cwd: process.cwd() };

    const result1 = await tool.execute("tc1", params, signal, undefined, ctx);
    const result2 = await tool.execute("tc2", params, signal, undefined, ctx);

    expect(text(result1)).toBe(text(result2));
    expect(result1.details.ptcValue).toEqual(result2.details.ptcValue);
  });
});

import { Text } from "@mariozechner/pi-tui";

describe("ls TUI renderers", () => {
  it("renderCall returns a Text object", async () => {
    const tool = await getLsTool();
    const theme = { fg: (_style: string, text: string) => text };
    const result = tool.renderCall({ path: "src" }, theme);
    expect(result).toBeInstanceOf(Text);
  });

  it("renderResult returns a Text object", async () => {
    const tool = await getLsTool();
    const theme = { fg: (_style: string, text: string) => text };
    const mockResult = {
      content: [{ type: "text", text: "sub-dir/\nfoo.ts" }],
    };
    const result = tool.renderResult(mockResult, {}, theme);
    expect(result).toBeInstanceOf(Text);
  });
});

import { readFileSync } from "node:fs";

describe("ls index.ts registration", () => {
  it("index.ts imports and calls registerLsTool", () => {
    const root = resolve(__dirname, "..");
    const source = readFileSync(resolve(root, "index.ts"), "utf8");
    expect(source).toContain('import { registerLsTool } from "./src/ls.js"');
    expect(source).toContain("registerLsTool(pi)");
  });

  it("extension entry point registers ls tool", async () => {
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
    expect(tools).toContain("ls");
  });
});

describe("ls path resolution", () => {
  it("resolves relative path via resolveToCwd against ctx.cwd", async () => {
    const tool = await getLsTool();
    // Pass a relative path and a cwd that makes it resolve to ls-basic
    const parentDir = resolve(fixturesDir, "..");
    const result = await tool.execute(
      "tc",
      { path: "ls-basic" },
      new AbortController().signal,
      undefined,
      { cwd: parentDir },
    );

    const ptc = result.details?.ptcValue;
    expect(ptc.totalEntries).toBe(4);
    expect(result.isError).toBeUndefined();
  });

  it("resolves tilde path", async () => {
    const tool = await getLsTool();
    // ~ should resolve to home directory
    const result = await tool.execute(
      "tc",
      { path: "~" },
      new AbortController().signal,
      undefined,
      { cwd: process.cwd() },
    );

    // Home dir should list without error
    expect(result.isError).toBeUndefined();
    const ptc = result.details?.ptcValue;
    expect(ptc.totalEntries).toBeGreaterThan(0);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

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
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
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

  function makeTmpDir(): string {
    return mkdtempSync(path.join(tmpdir(), "pi-sg-tsx-"));
  }

  it("rewrites lang:typescript → tsx when the path is a .tsx file (#173)", async () => {
    const tool = await getSgTool();
    const dir = makeTmpDir();
    const tsxPath = path.join(dir, "foo.tsx");
    writeFileSync(tsxPath, "export const App = () => <div>x</div>;\n", "utf8");

    const calls: string[][] = [];
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    try {
      await tool.execute(
        "tc",
        { pattern: "<div>$$$</div>", lang: "typescript", path: tsxPath },
        new AbortController().signal,
        () => {},
        { cwd: dir },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(calls).toHaveLength(1);
    const langIdx = calls[0].indexOf("-l");
    expect(langIdx).toBeGreaterThan(-1);
    expect(calls[0][langIdx + 1]).toBe("tsx");
    expect(calls[0]).not.toContain("typescript");
  });

  it("leaves lang:typescript alone when the path is a .ts file", async () => {
    const tool = await getSgTool();
    const dir = makeTmpDir();
    const tsPath = path.join(dir, "foo.ts");
    writeFileSync(tsPath, "export const x: number = 3;\n", "utf8");

    const calls: string[][] = [];
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    try {
      await tool.execute(
        "tc",
        { pattern: "const $X = $Y", lang: "typescript", path: tsPath },
        new AbortController().signal,
        () => {},
        { cwd: dir },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const langIdx = calls[0].indexOf("-l");
    expect(langIdx).toBeGreaterThan(-1);
    expect(calls[0][langIdx + 1]).toBe("typescript");
  });

  it("leaves lang:tsx alone when the path is a .tsx file (no regression)", async () => {
    const tool = await getSgTool();
    const dir = makeTmpDir();
    const tsxPath = path.join(dir, "foo.tsx");
    writeFileSync(tsxPath, "export const App = () => <div>x</div>;\n", "utf8");

    const calls: string[][] = [];
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    try {
      await tool.execute(
        "tc",
        { pattern: "<div>$$$</div>", lang: "tsx", path: tsxPath },
        new AbortController().signal,
        () => {},
        { cwd: dir },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const langIdx = calls[0].indexOf("-l");
    expect(langIdx).toBeGreaterThan(-1);
    expect(calls[0][langIdx + 1]).toBe("tsx");
  });

  it("leaves lang:typescript alone when the path is a directory (per-call scope preserved)", async () => {
    const tool = await getSgTool();
    const dir = makeTmpDir();
    writeFileSync(path.join(dir, "a.ts"), "export const x = 1;\n", "utf8");
    writeFileSync(path.join(dir, "b.tsx"), "export const App = () => <div/>;\n", "utf8");

    const calls: string[][] = [];
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    try {
      await tool.execute(
        "tc",
        { pattern: "p", lang: "typescript", path: dir },
        new AbortController().signal,
        () => {},
        { cwd: dir },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const langIdx = calls[0].indexOf("-l");
    expect(langIdx).toBeGreaterThan(-1);
    expect(calls[0][langIdx + 1]).toBe("typescript");
  });

  it("passes the pattern as a single --pattern= argument so leading dashes are not parsed as flags (#272)", async () => {
    const tool = await getSgTool();

    const calls: string[][] = [];
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, args: any, _opts: any, cb: any) => {
      calls.push(args);
      cb(null, "[]", "");
      return {} as any;
    });

    for (const pattern of ["--$A", "-$A", "--help", "console.log($X)"]) {
      await tool.execute("tc", { pattern, lang: "javascript" }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    }

    expect(calls).toHaveLength(4);
    expect(calls[0]).toContain("--pattern=--$A");
    expect(calls[1]).toContain("--pattern=-$A");
    expect(calls[2]).toContain("--pattern=--help");
    expect(calls[3]).toContain("--pattern=console.log($X)");
    for (const args of calls) {
      expect(args).not.toContain("-p");
      expect(args.slice(0, 3)).toEqual(["run", "--json", args[2]]);
      expect(args[2].startsWith("--pattern=")).toBe(true);
    }
  });
});

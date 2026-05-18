import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensureHashInit } from "../src/hashline.js";
import { PTC_ERROR_CODES } from "../src/ptc-error-codes.js";

let nuAvailable = false;
async function callTool(
  registerName:
    | "registerReadTool"
    | "registerEditTool"
    | "registerGrepTool"
    | "registerSgTool"
    | "registerFindTool"
    | "registerLsTool"
    | "registerWriteTool"
    | "registerNuTool",
  modulePath: string,
  params: Record<string, unknown>,
  options?: any,
) {
  const mod: any = await import(modulePath);
  const register = mod[registerName];
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  const ret = options !== undefined ? register(mockPi, options) : register(mockPi);
  if (ret === false) return null;
  if (!captured) throw new Error(`${registerName} did not register a tool`);
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

const getPtc = (r: any) => r?.details?.ptcValue;

function assertContract(r: any, tool: string, expectedCode: string) {
  expect(r).not.toBeNull();
  const ptc = getPtc(r);
  expect(ptc, `${tool}: ptcValue must be present on error`).toBeDefined();
  expect(ptc.tool, `${tool}: ptcValue.tool`).toBe(tool);
  expect(ptc.ok, `${tool}: ptcValue.ok must be false on error`).toBe(false);
  expect(ptc.error, `${tool}: ptcValue.error must be present`).toBeDefined();
  expect(typeof ptc.error.code, `${tool}: error.code is string`).toBe("string");
  expect(ptc.error.code, `${tool}: error.code in taxonomy`).toBe(expectedCode);
  expect(PTC_ERROR_CODES, `${tool}: error.code is documented`).toHaveProperty(expectedCode);
  expect(typeof ptc.error.message, `${tool}: error.message is string`).toBe("string");
  expect(ptc.error.message.length, `${tool}: error.message is non-empty`).toBeGreaterThan(0);
}

describe("ptc-error contract — every tool emits ptcValue.error on representative failure", () => {
  beforeAll(async () => {
    await ensureHashInit();
    const nu = await import("../src/nu.js");
    nuAvailable = nu.isNuAvailable();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../src/binary-resolution.js");
    vi.doUnmock("node:child_process");
    vi.resetModules();
  });

  it("read → file-not-found", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-c-r-"));
    const r = await callTool("registerReadTool", "../src/read.js", { path: resolve(dir, "missing.txt") });
    assertContract(r, "read", "file-not-found");
  });

  it("edit → file-not-read", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-c-e-"));
    const f = resolve(dir, "f.ts");
    writeFileSync(f, "x\n", "utf-8");
    const r = await callTool(
      "registerEditTool",
      "../src/edit.js",
      { path: f, edits: [{ set_line: { anchor: "1:00", new_text: "y" } }] },
      { wasReadInSession: () => false },
    );
    assertContract(r, "edit", "file-not-read");
  });

  it("grep → invalid-limit", async () => {
    const r = await callTool("registerGrepTool", "../src/grep.js", { pattern: "x", limit: "abc" });
    assertContract(r, "grep", "invalid-limit");
  });

  it("ast_search → sg-not-installed", async () => {
    vi.doMock("../src/binary-resolution.js", () => ({
      resolveBundledBin: (_packageName: string, _binName: string, fallbackCommand: string) => fallbackCommand,
      executableCommand: (command: string) => ({ command, argsPrefix: [] }),
    }));
    vi.doMock("node:child_process", () => ({
      execFile: vi.fn((_cmd: any, _args: any, _opts: any, cb: any) => {
        const err: any = new Error("command not found: sg");
        err.code = "ENOENT";
        cb(err, "", "");
        return {} as any;
      }),
    }));
    const orig = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      const r = await callTool("registerSgTool", "../src/sg.js", { pattern: "$X", lang: "ts" });
      assertContract(r, "ast_search", "sg-not-installed");
    } finally {
      process.env.PATH = orig;
    }
  });

  it("find → path-not-found", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-c-f-"));
    const r = await callTool("registerFindTool", "../src/find.js", { pattern: "*.ts", path: resolve(dir, "missing") });
    assertContract(r, "find", "path-not-found");
  });

  it("ls → path-not-found", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-c-l-"));
    const r = await callTool("registerLsTool", "../src/ls.js", { path: resolve(dir, "missing") });
    assertContract(r, "ls", "path-not-found");
  });

  it("write → binary-content (AC 14)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-c-w-"));
    const f = resolve(dir, "b.bin");
    const r = await callTool("registerWriteTool", "../src/write.js", { path: f, content: "hello\u0000world" });
    assertContract(r, "write", "binary-content");
    expect(r!.isError).toBe(true);
  });

  it("nu → nu-non-zero-exit (AC 15)", async () => {
    if (!nuAvailable) return;
    const r = await callTool("registerNuTool", "../src/nu.js", { command: "exit 1" });
    assertContract(r, "nu", "nu-non-zero-exit");
    expect(r!.isError).toBeFalsy();
  });
});

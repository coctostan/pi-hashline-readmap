import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { PTC_ERROR_CODES } from "../src/ptc-error-codes.js";

async function callTool(
  registerName:
    | "registerReadTool"
    | "registerEditTool"
    | "registerLsTool"
    | "registerFindTool"
    | "registerWriteTool",
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

describe("ptc-error fixes v2 — AC 6/8/14 gaps", () => {

  // AC 8 — concrete recovery text in content[0].text must also populate error.hint
  it("read → path-is-directory populates error.hint with the recovery step", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-rdir-"));
    const sub = resolve(dir, "sub"); mkdirSync(sub);
    const r = await callTool("registerReadTool", "../src/read.js", { path: sub });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("path-is-directory");
    expect(typeof ptc?.error?.hint).toBe("string");
    expect(ptc!.error!.hint!.length).toBeGreaterThan(0);
    expect(ptc!.error!.hint!.toLowerCase()).toContain("ls");
  });

  it("edit → path-is-directory populates error.hint with the recovery step", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-edir-"));
    const sub = resolve(dir, "sub"); mkdirSync(sub);
    const r = await callTool(
      "registerEditTool",
      "../src/edit.js",
      { path: sub, edits: [{ set_line: { anchor: "1:00", new_text: "x" } }] },
      { wasReadInSession: () => true },
    );
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("path-is-directory");
    expect(typeof ptc?.error?.hint).toBe("string");
    expect(ptc!.error!.hint!.length).toBeGreaterThan(0);
  });

  it("ls → path-not-directory populates error.hint with the recovery step", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-lsnd-"));
    const f = resolve(dir, "f.txt"); writeFileSync(f, "x", "utf-8");
    const r = await callTool("registerLsTool", "../src/ls.js", { path: f });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("path-not-directory");
    expect(typeof ptc?.error?.hint).toBe("string");
    expect(ptc!.error!.hint!.length).toBeGreaterThan(0);
    expect(ptc!.error!.hint!.toLowerCase()).toContain("read");
  });

  it("find → path-not-directory populates error.hint with the recovery step", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-fnd-"));
    const f = resolve(dir, "f.txt"); writeFileSync(f, "x", "utf-8");
    const r = await callTool("registerFindTool", "../src/find.js", { pattern: "*.ts", path: f });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("path-not-directory");
    expect(typeof ptc?.error?.hint).toBe("string");
    expect(ptc!.error!.hint!.length).toBeGreaterThan(0);
  });

  // AC 6 — trigger alignment: filter-parse errors are NOT stat failures
  it("find → malformed minSize surfaces invalid-params-combo (not path-not-found)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-fms-"));
    const r = await callTool("registerFindTool", "../src/find.js", {
      pattern: "*.ts",
      path: dir,
      minSize: "not-a-size",
    });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("invalid-params-combo");
    expect(PTC_ERROR_CODES).toHaveProperty(ptc!.error!.code);
  });

  it("find → malformed modifiedSince surfaces invalid-params-combo (not path-not-found)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-fmd-"));
    const r = await callTool("registerFindTool", "../src/find.js", {
      pattern: "*.ts",
      path: dir,
      modifiedSince: "not-a-date",
    });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("invalid-params-combo");
  });

  // AC 14 — write must emit a representative ptcValue.error path with taxonomy code
  it("write → binary content emits fatal ptcValue.error with code binary-content", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-wbin-"));
    const f = resolve(dir, "b.bin");
    const content = "hello\u0000world"; // contains NUL → binary
    const r = await callTool("registerWriteTool", "../src/write.js", { path: f, content });
    expect(r?.isError).toBe(true);
    const ptc = getPtc(r);
    expect(ptc?.tool).toBe("write");
    expect(ptc?.ok).toBe(false);
    expect(ptc?.error?.code).toBe("binary-content");
    expect(typeof ptc?.error?.message).toBe("string");
    expect(ptc!.error!.message.length).toBeGreaterThan(0);
    expect(PTC_ERROR_CODES).toHaveProperty("binary-content");
  });

  it("read → unexpected fs failures surface fs-error (not file-not-found)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-rfs-"));
    const tooLong = resolve(dir, "a".repeat(5000));
    const r = await callTool("registerReadTool", "../src/read.js", { path: tooLong });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("fs-error");
    expect(ptc?.error?.message).toContain("File not readable");
  });

  it("edit → unexpected fs failures surface fs-error (not file-not-found)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-efs-"));
    const tooLong = resolve(dir, "a".repeat(5000));
    const r = await callTool(
      "registerEditTool",
      "../src/edit.js",
      { path: tooLong, edits: [{ set_line: { anchor: "1:00", new_text: "x" } }] },
      { wasReadInSession: () => true },
    );
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("fs-error");
    expect(ptc?.error?.message).toContain("File not readable");
  });

  it("find → unexpected fs failures surface fs-error (not path-not-found)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-ffs-"));
    const tooLong = resolve(dir, "a".repeat(5000));
    const r = await callTool("registerFindTool", "../src/find.js", { pattern: "*.ts", path: tooLong });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("fs-error");
    expect(ptc?.error?.message).toContain("could not access");
  });

  it("ls → unexpected fs failures surface fs-error (not path-not-found)", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-v2-lfs-"));
    const tooLong = resolve(dir, "a".repeat(5000));
    const r = await callTool("registerLsTool", "../src/ls.js", { path: tooLong });
    const ptc = getPtc(r);
    expect(ptc?.error?.code).toBe("fs-error");
    expect(ptc?.error?.message).toContain("could not access");
  });
});

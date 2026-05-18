import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

function captureEditTool(opts?: any) {
  let captured: any = null;
  registerEditTool({ registerTool(def: any) { captured = def; } } as any, opts);
  if (!captured) throw new Error("edit tool was not registered");
  return captured;
}

describe("syntax-regression validator wired into edit (warn mode)", () => {

  it("emits a syntax-regression warning when an edit introduces tree-sitter errors", async () => {
    const tool = captureEditTool();
    const dir = mkdtempSync(resolve(tmpdir(), "pi-syntax-warn-"));
    const fp = resolve(dir, "sample.rs");
    writeFileSync(fp, "fn a() { 1 }\n", "utf8");
    try {
      const original = readFileSync(fp, "utf8");
      const lines = original.split("\n");
      const anchor = `1:${computeLineHash(1, lines[0])}`;
      const res = await tool.execute(
        "warn-1",
        {
          path: fp,
          edits: [
            { set_line: { anchor, new_text: "fn a( {" } },
            { insert_after: { anchor, new_text: "fn b(\n" } },
          ],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(res.isError).toBeFalsy();
      const warnings: string[] = res.details?.ptcValue?.warnings ?? [];
      expect(warnings.some((w) => w.startsWith("syntax-regression: lines "))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("block mode aborts the edit with syntax-regression ptc code and leaves the file unchanged", async () => {
    const tool = captureEditTool({ syntaxValidate: "block" });
    const dir = mkdtempSync(resolve(tmpdir(), "pi-syntax-block-"));
    const fp = resolve(dir, "sample.rs");
    const original = "fn a() { 1 }\n";
    writeFileSync(fp, original, "utf8");
    try {
      const lines = original.split("\n");
      const anchor = `1:${computeLineHash(1, lines[0])}`;
      const res = await tool.execute(
        "block-1",
        {
          path: fp,
          edits: [
            { set_line: { anchor, new_text: "fn a( {" } },
            { insert_after: { anchor, new_text: "fn b(\n" } },
          ],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(res.isError).toBe(true);
      expect(res.details?.ptcValue?.error?.code).toBe("syntax-regression");
      expect(res.details?.ptcValue?.error?.message).toMatch(/lines \d+/);
      expect(readFileSync(fp, "utf8")).toBe(original);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("off mode skips validation entirely (no syntax-regression warning even on regression)", async () => {
    const tool = captureEditTool({ syntaxValidate: "off" });
    const dir = mkdtempSync(resolve(tmpdir(), "pi-syntax-off-"));
    const fp = resolve(dir, "sample.rs");
    const original = "fn a() { 1 }\n";
    writeFileSync(fp, original, "utf8");
    try {
      const lines = original.split("\n");
      const anchor = `1:${computeLineHash(1, lines[0])}`;
      const res = await tool.execute(
        "off-1",
        {
          path: fp,
          edits: [
            { set_line: { anchor, new_text: "fn a( {" } },
            { insert_after: { anchor, new_text: "fn b(\n" } },
          ],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(res.isError).toBeFalsy();
      const warnings: string[] = res.details?.ptcValue?.warnings ?? [];
      expect(warnings.some((w) => w.startsWith("syntax-regression"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pre-existing syntax errors do not trigger a regression on a benign edit elsewhere", async () => {
    const tool = captureEditTool();
    const dir = mkdtempSync(resolve(tmpdir(), "pi-syntax-pre-"));
    const fp = resolve(dir, "sample.rs");
    // Pre-existing broken `fn bad( {` on line 1; well-formed `fn ok()` on line 2.
    const original = "fn bad( {\nfn ok() { 1 }\n";
    writeFileSync(fp, original, "utf8");
    try {
      const lines = original.split("\n");
      // Edit the well-formed line 2 — leave it well-formed.
      const anchor = `2:${computeLineHash(2, lines[1])}`;
      const res = await tool.execute(
        "pre-1",
        {
          path: fp,
          edits: [{ set_line: { anchor, new_text: "fn ok() { 2 }" } }],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(res.isError).toBeFalsy();
      const warnings: string[] = res.details?.ptcValue?.warnings ?? [];
      expect(warnings.some((w) => w.startsWith("syntax-regression"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CRLF round-trip on a benign edit produces no spurious syntax-regression warning", async () => {
    const tool = captureEditTool();
    const dir = mkdtempSync(resolve(tmpdir(), "pi-syntax-crlf-"));
    const fp = resolve(dir, "sample.rs");
    // Write CRLF Rust file. Both lines are well-formed.
    const original = "fn a() { 1 }\r\nfn b() { 2 }\r\n";
    writeFileSync(fp, original, "utf8");
    try {
      // The edit tool normalizes CRLF→LF internally; line 1 (LF view) is `fn a() { 1 }`.
      const lfLine1 = "fn a() { 1 }";
      const anchor = `1:${computeLineHash(1, lfLine1)}`;
      const res = await tool.execute(
        "crlf-1",
        {
          path: fp,
          edits: [{ set_line: { anchor, new_text: "fn a() { 3 }" } }],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(res.isError).toBeFalsy();
      const warnings: string[] = res.details?.ptcValue?.warnings ?? [];
      expect(warnings.some((w) => w.startsWith("syntax-regression"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from "vitest";
import { createJiti } from "jiti";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function createPiHarness(init: any) {
  const handlers: Record<string, Function> = {};
  init({
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);
  return { handlers, executors: (globalThis as any).__hashlineToolExecutors };
}

function firstText(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

describe("hashline singleton state under dual module instances", () => {
  it("shares initialized hash state and supports the read -> grep -> write -> read -> edit flow", async () => {
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const base = `${process.cwd()}/src/`;
    const extensionless = await jiti.import<typeof import("../src/hashline.js")>(`${base}hashline`);
    const withExtension = await jiti.import<typeof import("../src/hashline.js")>(`${base}hashline.js`);

    expect(extensionless).not.toBe(withExtension);

    await extensionless.ensureHashInit();

    expect(withExtension.computeLineHash(1, "hello")).toBe(extensionless.computeLineHash(1, "hello"));

    const init = await jiti.import<any>(`${process.cwd()}/index.ts`, { default: true });
    const { executors } = createPiHarness(init);
    const dir = mkdtempSync(join(tmpdir(), "hashline-flow-"));
    try {
      const filePath = join(dir, "sample.ts");
      writeFileSync(filePath, "const value = 1;\n", "utf8");

      const read1 = await executors.read.execute(
        "read-1",
        { path: filePath },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );
      expect(read1.isError).not.toBe(true);

      const grep = await executors.grep.execute(
        "grep-1",
        { path: filePath, pattern: "value", literal: true },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );
      expect(grep.isError).not.toBe(true);

      const write = await executors.write.execute(
        "write-1",
        { path: filePath, content: "const value = 2;\n" },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );
      expect(write.isError).not.toBe(true);

      const read2 = await executors.read.execute(
        "read-2",
        { path: filePath },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );
      expect(read2.isError).not.toBe(true);

      const anchor = firstText(read2).match(/^(\d+:[0-9a-f]{3})\|const value = 2;/m)?.[1];
      expect(anchor).toBeDefined();

      const edit = await executors.edit.execute(
        "edit-1",
        { path: filePath, edits: [{ set_line: { anchor, new_text: "const value = 3;" } }] },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );
      expect(edit.isError).not.toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      delete (globalThis as any).__hashlineToolExecutors;
    }
  });
});

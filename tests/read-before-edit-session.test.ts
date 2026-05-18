import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import init from "../index.js";

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

function createHarness() {
  const tools: Record<string, any> = {};
  const handlers: Record<string, Function> = {};

  init(
    {
      registerTool(def: any) {
        tools[def.name] = def;
      },
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
      events: { emit() {}, on() {} },
    } as any,
  );

  return { tools, handlers };
}

describe("extension-scoped read tracking", () => {
  it("blocks unread edits, then allows the same edit after a successful read of the normalized path", async () => {

    const dir = mkdtempSync(resolve(tmpdir(), "pi-read-before-edit-"));
    const filePath = resolve(dir, "sample.ts");
    writeFileSync(filePath, "const value = 1;\n", "utf-8");

    const anchor = `1:${computeLineHash(1, "const value = 1;")}`;
    const { tools } = createHarness();

    const unreadAttempt = await tools.edit.execute(
      "edit-unread",
      {
        path: filePath,
        edits: [{ set_line: { anchor, new_text: "const value = 2;" } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(unreadAttempt.isError).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("const value = 1;\n");

    const readPath = relative(process.cwd(), filePath);
    const readResult = await tools.read.execute(
      "read-first",
      { path: readPath },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(readResult.isError).not.toBe(true);

    const editResult = await tools.edit.execute(
      "edit-after-read",
      {
        path: filePath,
        edits: [{ set_line: { anchor, new_text: "const value = 2;" } }],
      },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editResult.isError).not.toBe(true);
    expect(getTextContent(editResult)).toContain(`Edited ${filePath} (1 change, +1 -1 line)`);
    expect(readFileSync(filePath, "utf-8")).toBe("const value = 2;\n");
  });
});

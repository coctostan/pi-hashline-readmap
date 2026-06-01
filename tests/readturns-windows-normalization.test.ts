import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import init from "../index.js";
import { buildContextHygieneMetadata, buildFileResource } from "../src/context-hygiene.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function createHarness() {
  const handlers: Record<string, Function> = {};
  init({
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);
  return handlers;
}

describe("Windows-style readTurns stale expiry", () => {
  afterEach(() => {
    delete (globalThis as any).__hashlineToolExecutors;
  });

  it("expires read-before-edit guard entries when stale keys are slash-normalized", async () => {
    await ensureHashInit();
    const dir = mkdtempSync(join(tmpdir(), "readturns-win-"));
    try {
      const filePath = join(dir, "has\\backslash.ts");
      writeFileSync(filePath, "const value = 1;\n", "utf8");

      const handlers = createHarness();
      const executors = (globalThis as any).__hashlineToolExecutors;

      const readResult = await executors.read.execute(
        "read-call",
        { path: filePath },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      await handlers.tool_result({
        type: "tool_result",
        toolName: "read",
        toolCallId: "read-call",
        input: { path: filePath },
        content: readResult.content,
        isError: false,
        details: readResult.details,
      }, {});

      await handlers.tool_result({
        type: "tool_result",
        toolName: "edit",
        toolCallId: "edit-call",
        input: { path: filePath },
        content: [{ type: "text", text: "edit succeeded" }],
        isError: false,
        details: {
          contextHygiene: buildContextHygieneMetadata({
            tool: "edit",
            classification: "mutation",
            resources: [buildFileResource(filePath)],
          }),
        },
      }, {});

      handlers.context({ type: "context", messages: [] }, {});

      const original = readFileSync(filePath, "utf8").split("\n")[0];
      const anchor = `1:${computeLineHash(1, original)}`;
      const editResult = await executors.edit.execute(
        "second-edit",
        {
          path: filePath,
          edits: [{ set_line: { anchor, new_text: "const value = 2;" } }],
        },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(editResult.isError).toBe(true);
      expect(editResult.details?.ptcValue?.error?.code).toBe("file-not-read");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

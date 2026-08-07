import { beforeEach, describe, expect, it } from "vitest";
import init from "../index.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  resetContextHygieneTracker,
} from "../src/context-hygiene.js";
import { resetContextHygieneNoticeLedger } from "../src/context-hygiene-notices.js";

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

function textOf(result: any): string {
  return result?.content?.find((item: any) => item.type === "text")?.text ?? "";
}

function toolResultEvent(toolName: string, toolCallId: string, path: string, text: string, classification: any) {
  return {
    type: "tool_result",
    toolName,
    toolCallId,
    input: { path },
    content: [{ type: "text", text }],
    isError: false,
    details: {
      contextHygiene: buildContextHygieneMetadata({
        tool: toolName,
        classification,
        resources: [buildFileResource(path)],
      }),
    },
  };
}

beforeEach(() => {
  resetContextHygieneTracker();
  resetContextHygieneNoticeLedger();
});

describe("issue #225 — forward-only stale notice on non-bash tool results", () => {
  it("leaves a tool result untouched when nothing has gone stale", async () => {
    const handlers = createHarness();
    const result = await handlers.tool_result(
      toolResultEvent("read", "read-a", "src/a.ts", "read output for src/a.ts", "read-context"),
      {},
    );
    expect(result).toBeUndefined();
  });

  it("prefixes the stale notice onto the edit result that caused the staleness", async () => {
    const handlers = createHarness();
    await handlers.tool_result(
      toolResultEvent("read", "read-a", "src/a.ts", "read output for src/a.ts", "read-context"),
      {},
    );

    const editResult = await handlers.tool_result(
      toolResultEvent("edit", "edit-a", "src/a.ts", "edit succeeded", "mutation"),
      {},
    );

    const text = textOf(editResult);
    expect(text).toContain("[Context hygiene] 1 earlier tool result no longer reflects current state.");
    expect(text).toContain("- read (file:src/a.ts): [Stale read result —");
    // The original tool output is preserved below the notice separator.
    expect(text).toContain("---\nedit succeeded");
  });

  it("announces each stale record only once across later tool results", async () => {
    const handlers = createHarness();
    await handlers.tool_result(
      toolResultEvent("read", "read-a", "src/a.ts", "read output for src/a.ts", "read-context"),
      {},
    );
    await handlers.tool_result(
      toolResultEvent("edit", "edit-a", "src/a.ts", "edit succeeded", "mutation"),
      {},
    );

    const later = await handlers.tool_result(
      toolResultEvent("read", "read-b", "src/b.ts", "read output for src/b.ts", "read-context"),
      {},
    );
    expect(later).toBeUndefined();
  });

  it("announces stale grep context with the grep-specific wording", async () => {
    const handlers = createHarness();
    await handlers.tool_result(
      toolResultEvent("grep", "grep-a", "src/a.ts", "grep output for src/a.ts", "search-context"),
      {},
    );

    const editResult = await handlers.tool_result(
      toolResultEvent("edit", "edit-a", "src/a.ts", "edit succeeded", "mutation"),
      {},
    );

    expect(textOf(editResult)).toContain("- grep (file:src/a.ts): [Stale grep result —");
  });

  it("re-announces after a fresh extension init resets the ledger", async () => {
    const first = createHarness();
    await first.tool_result(
      toolResultEvent("read", "read-a", "src/a.ts", "read output for src/a.ts", "read-context"),
      {},
    );
    const firstEdit = await first.tool_result(
      toolResultEvent("edit", "edit-a", "src/a.ts", "edit succeeded", "mutation"),
      {},
    );
    expect(textOf(firstEdit)).toContain("[Context hygiene]");

    // A second init is a new session: the tracker is reset at index.ts:179 and
    // the notice ledger must be reset alongside it, or identical resultIds from
    // the new session would be silently swallowed as already-announced.
    const second = createHarness();
    await second.tool_result(
      toolResultEvent("read", "read-a", "src/a.ts", "read output for src/a.ts", "read-context"),
      {},
    );
    const secondEdit = await second.tool_result(
      toolResultEvent("edit", "edit-a", "src/a.ts", "edit succeeded", "mutation"),
      {},
    );
    expect(textOf(secondEdit)).toContain("[Context hygiene]");
  });
});

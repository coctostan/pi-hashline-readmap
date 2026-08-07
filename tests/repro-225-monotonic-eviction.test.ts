import { beforeEach, describe, expect, it } from "vitest";
import init from "../index.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  resetContextHygieneTracker,
} from "../src/context-hygiene.js";
import { resetContextHygieneNoticeLedger } from "../src/context-hygiene-notices.js";

type Msg = {
  role: string;
  toolCallId?: string;
  toolName?: string;
  content: Array<{ type: string; text: string }>;
  details?: Record<string, unknown>;
  isError?: boolean;
  timestamp?: number;
};

function createHarness() {
  const handlers: Record<string, Function> = {};
  init({
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);
  // init() installs a fresh tracker with the default maxEvents of 1000
  // (index.ts:179), so the small ring buffer must be installed AFTER it. The
  // extension resolves the tracker lazily through getContextHygieneTracker()
  // on every hook call (index.ts:80, :98, :257, :344), so swapping it here
  // takes effect for everything below.
  resetContextHygieneTracker({ maxEvents: 4 });
  return handlers;
}

function textOf(result: any): string {
  return result?.content?.find((item: any) => item.type === "text")?.text ?? "";
}

function toolResult(toolCallId: string, toolName: string, text: string): Msg {
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    details: {},
    isError: false,
    timestamp: 1,
  };
}

function recordEvent(handlers: Record<string, Function>, toolName: string, toolCallId: string, path: string, classification: any) {
  return handlers.tool_result(
    {
      type: "tool_result",
      toolName,
      toolCallId,
      input: { path },
      content: [{ type: "text", text: `${toolName} output for ${path}` }],
      isError: false,
      details: {
        contextHygiene: buildContextHygieneMetadata({
          tool: toolName,
          classification,
          resources: [buildFileResource(path)],
        }),
      },
    },
    {},
  );
}

function applyContext(handlers: Record<string, Function>, messages: Msg[]): Msg[] {
  const result = handlers.context({ type: "context", messages }, {});
  return (result?.messages ?? messages) as Msg[];
}

beforeEach(() => {
  resetContextHygieneNoticeLedger();
});

describe("issue #225 — stale signalling is monotonic across ring-buffer eviction", () => {
  it("keeps historical provider content byte-identical before and after the stale record is evicted", async () => {
    const handlers = createHarness();

    await recordEvent(handlers, "read", "read-a", "src/a.ts", "read-context");
    await recordEvent(handlers, "edit", "edit-a", "src/a.ts", "mutation");

    const history: Msg[] = [toolResult("read-a", "read", "read output for src/a.ts")];
    const beforeEviction = applyContext(handlers, [...history]);
    const beforeText = beforeEviction[0]!.content[0]!.text;

    // Before eviction the historical message must already be untouched.
    expect(beforeText).toBe("read output for src/a.ts");

    // Push enough unrelated events to evict read-a and edit-a from the buffer.
    await recordEvent(handlers, "read", "z1", "src/z1.ts", "read-context");
    await recordEvent(handlers, "read", "z2", "src/z2.ts", "read-context");
    await recordEvent(handlers, "read", "z3", "src/z3.ts", "read-context");
    await recordEvent(handlers, "read", "z4", "src/z4.ts", "read-context");

    const afterEviction = applyContext(handlers, [...history]);
    const afterText = afterEviction[0]!.content[0]!.text;

    // …and eviction must not flip it back the other way (the H1 un-masking bug).
    expect(afterText).toBe(beforeText);
  });

  it("delivers the stale signal exactly once, into a message eviction cannot reach", async () => {
    const handlers = createHarness();

    await recordEvent(handlers, "read", "read-a", "src/a.ts", "read-context");
    const editResult = await recordEvent(handlers, "edit", "edit-a", "src/a.ts", "mutation");

    // The signal is delivered into a brand-new message, before the ring buffer
    // can evict the record it was derived from.
    expect(textOf(editResult)).toContain("[Context hygiene]");
    expect(textOf(editResult)).toContain("- read (file:src/a.ts): [Stale read result —");

    // A second mutation of the same file re-derives a stale record for read-a
    // (higher invalidating mutation id) — it must not be announced again.
    const second = await recordEvent(handlers, "edit", "edit-a2", "src/a.ts", "mutation");
    expect(textOf(second)).not.toContain("- read (file:src/a.ts): [Stale read result —");
  });
});

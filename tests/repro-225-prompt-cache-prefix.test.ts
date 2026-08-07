import { beforeEach, describe, expect, it } from "vitest";
import init from "../index.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  resetContextHygieneTracker,
} from "../src/context-hygiene.js";

/**
 * Repro for issue #225 (GitHub #159).
 *
 * The `context` hook rewrites *historical* toolResult messages in place
 * (same array index) when a later mutation makes them stale. Providers with
 * prompt caching (Anthropic, OpenAI/Codex) key their cache on an exact
 * serialized prefix of the request. Mutating an early message truncates the
 * reusable prefix to everything BEFORE that message.
 *
 * This test measures the stable common prefix across successive provider
 * contexts and fails while the current in-place masking is used.
 */

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
  return handlers;
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

function serialize(message: Msg): string {
  return JSON.stringify({
    role: message.role,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: message.content,
  });
}

/** Number of leading messages that serialize identically in both contexts. */
function stablePrefixLength(a: readonly Msg[], b: readonly Msg[]): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && serialize(a[i]!) === serialize(b[i]!)) i++;
  return i;
}

async function recordRead(handlers: Record<string, Function>, toolCallId: string, path: string) {
  await handlers.tool_result(
    {
      type: "tool_result",
      toolName: "read",
      toolCallId,
      input: { path },
      content: [{ type: "text", text: `read output for ${path}` }],
      isError: false,
      details: {
        contextHygiene: buildContextHygieneMetadata({
          tool: "read",
          classification: "read-context",
          resources: [buildFileResource(path)],
        }),
      },
    },
    {},
  );
}

async function recordEdit(handlers: Record<string, Function>, toolCallId: string, path: string) {
  await handlers.tool_result(
    {
      type: "tool_result",
      toolName: "edit",
      toolCallId,
      input: { path },
      content: [{ type: "text", text: `edited ${path}` }],
      isError: false,
      details: {
        contextHygiene: buildContextHygieneMetadata({
          tool: "edit",
          classification: "mutation",
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
  resetContextHygieneTracker();
});

describe("issue #225 — prompt-cache prefix stability across stale marking", () => {
  it("keeps the historical provider prefix byte-stable when an earlier read goes stale", async () => {
    const handlers = createHarness();

    // Turn 1: three reads, nothing stale yet.
    await recordRead(handlers, "read-a", "src/a.ts");
    await recordRead(handlers, "read-b", "src/b.ts");
    await recordRead(handlers, "read-c", "src/c.ts");

    const history: Msg[] = [
      toolResult("read-a", "read", "read output for src/a.ts"),
      toolResult("read-b", "read", "read output for src/b.ts"),
      toolResult("read-c", "read", "read output for src/c.ts"),
    ];
    const turn1 = applyContext(handlers, [...history]);

    // Turn 2: edit src/a.ts — read-a (index 0) becomes stale.
    await recordEdit(handlers, "edit-a", "src/a.ts");
    const history2 = [...history, toolResult("edit-a", "edit", "edited src/a.ts")];
    const turn2 = applyContext(handlers, history2);

    // The cacheable prefix should still cover every message that existed in
    // turn 1; only appended messages should differ.
    expect(stablePrefixLength(turn1, turn2)).toBe(turn1.length);
  });

  it("does not re-invalidate the prefix again on each subsequent mutation", async () => {
    const handlers = createHarness();

    await recordRead(handlers, "read-a", "src/a.ts");
    await recordRead(handlers, "read-b", "src/b.ts");

    const history: Msg[] = [
      toolResult("read-a", "read", "read output for src/a.ts"),
      toolResult("read-b", "read", "read output for src/b.ts"),
    ];

    await recordEdit(handlers, "edit-a", "src/a.ts");
    history.push(toolResult("edit-a", "edit", "edited src/a.ts"));
    const turn2 = applyContext(handlers, [...history]);

    await recordEdit(handlers, "edit-b", "src/b.ts");
    history.push(toolResult("edit-b", "edit", "edited src/b.ts"));
    const turn3 = applyContext(handlers, [...history]);

    expect(stablePrefixLength(turn2, turn3)).toBe(turn2.length);
  });
});

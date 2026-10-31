/**
 * An edit and a read of the same file issued in one assistant turn. Pi runs a turn's calls in
 * parallel unless a tool in it is sequential; edit and write are, so the read runs after the edit,
 * shows the written file, and its anchors stay fresh for the next turn's edit. Driven through the
 * locked host's real agent loop, so Pi's scheduling and its before/after hooks are exercised.
 * Adapted from community PR #238 by @llehouerou.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, expect, it } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(ensureHashInit);

async function loadAgentLoop() {
  const host = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");
  const coreManifest = createRequire(join(host, "package.json")).resolve("@earendil-works/pi-agent-core/package.json");
  return import(pathToFileURL(join(dirname(coreManifest), "dist/agent-loop.js")).href);
}

function loadExtension() {
  const definitions = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({
    registerTool: (definition: any) => definitions.set(definition.name, definition),
    on: (event: string, handler: Function) => (handlers[event] = handler),
    events: { emit() {}, on() {} },
  } as any);
  return { definitions, handlers };
}

const textOf = (message: any): string => message.content.map((item: any) => item.text ?? "").join("\n");

it("edit and write are sequential tools; read is not", () => {
  const { definitions } = loadExtension();
  expect(definitions.get("edit").executionMode).toBe("sequential");
  expect(definitions.get("write").executionMode).toBe("sequential");
  expect(definitions.get("read").executionMode).toBeUndefined();
});

it("a read batched after an edit of the same file sees the edit and stays fresh", async () => {
  const { runAgentLoop } = await loadAgentLoop();
  const cwd = mkdtempSync(join(tmpdir(), "edit-batch-order-"));
  const file = join(cwd, "f.ts");
  writeFileSync(file, "aaa\nbbb\nccc\nddd\n");

  const { definitions, handlers } = loadExtension();
  const tools = [...definitions.values()].map((definition) => ({
    ...definition,
    execute: (id: string, params: any, signal: AbortSignal, onUpdate: any) => definition.execute(id, params, signal, onUpdate, { cwd }),
  }));
  // What Pi's extension runner does in its agent hooks: tool_call before, tool_result after.
  const beforeToolCall = async ({ toolCall, args }: any) => {
    await handlers.tool_call({ type: "tool_call", toolName: toolCall.name, toolCallId: toolCall.id, input: args }, { cwd });
    return undefined;
  };
  const afterToolCall = ({ toolCall, args, result, isError }: any) =>
    handlers.tool_result(
      { type: "tool_result", toolName: toolCall.name, toolCallId: toolCall.id, input: args, content: result.content, details: result.details, isError },
      { cwd },
    );
  let turns = 0;
  const turn = async (calls: Array<{ name: string; arguments: Record<string, unknown> }>) => {
    // Pi fires context once before each model request, i.e. once per turn.
    handlers.context({ type: "context", messages: [] });
    const content = calls.map((call, index) => ({ type: "toolCall", id: `turn${turns}-${index}`, ...call }));
    turns++;
    const assistant = { role: "assistant", content, stopReason: "toolUse" };
    const messages = await runAgentLoop(
      [],
      { messages: [], tools },
      { model: { provider: "test" }, convertToLlm: (m: unknown) => m, shouldStopAfterTurn: () => true, beforeToolCall, afterToolCall },
      async () => {},
      undefined,
      () => ({ async *[Symbol.asyncIterator]() {}, result: async () => assistant }),
    );
    // The tool-result messages the model would receive, in call order.
    return content.map((call) => messages.find((m: any) => m.role === "toolResult" && m.toolCallId === call.id));
  };

  await turn([{ name: "read", arguments: { path: file } }]);
  const [edited, batchedRead] = await turn([
    { name: "edit", arguments: { path: file, edits: [{ set_line: { anchor: `1:${computeLineHash(1, "aaa")}`, new_text: "AAA\nNEW" } }] } },
    { name: "read", arguments: { path: file, offset: 3 } },
  ]);
  expect(edited.isError).toBe(false);
  const dddAnchor = /^(\d+:[0-9a-f]{3})\|ddd$/m.exec(textOf(batchedRead))?.[1];
  expect(dddAnchor).toBe(`5:${computeLineHash(5, "ddd")}`);

  const [next] = await turn([{ name: "edit", arguments: { path: file, edits: [{ set_line: { anchor: dddAnchor, new_text: "DDD" } }] } }]);
  expect(next.isError, textOf(next)).toBe(false);
  expect(readFileSync(file, "utf8")).toBe("AAA\nNEW\nbbb\nccc\nDDD\n");
});

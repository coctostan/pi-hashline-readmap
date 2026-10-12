import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => {
  await ensureHashInit();
});

const h = (text: string) => computeLineHash(1, text);

function session(fileName: string, fixture: string) {
  const dir = mkdtempSync(join(tmpdir(), "edit-shift-notice-"));
  writeFileSync(join(dir, fileName), fixture, "utf8");
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({
    registerTool(definition: any) {
      tools.set(definition.name, definition);
    },
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);
  let next = 0;
  async function call(name: string, params: Record<string, unknown>) {
    const tool = tools.get(name);
    const id = `call-${next++}`;
    const args = tool.prepareArguments ? tool.prepareArguments(params) : params;
    await handlers.tool_call?.({ type: "tool_call", toolName: name, toolCallId: id, input: args }, { cwd: dir });
    const result: any = await tool.execute(id, args, new AbortController().signal, undefined, { cwd: dir });
    const event = { type: "tool_result", toolName: name, toolCallId: id, input: args, content: result.content, details: result.details, isError: result.isError === true };
    const patched = await handlers.tool_result?.(event, { cwd: dir });
    const final = patched ? { ...result, ...patched } : result;
    return (final.content as Array<{ type: string; text?: string }>).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
  }
  return {
    read: () => call("read", { path: fileName }),
    edit: (edits: unknown[]) => call("edit", { path: fileName, edits }),
  };
}

describe("edit result reports shifted line numbers", () => {
  it("says which old lines moved after an insertion", async () => {
    const s = session("shift.txt", "a\nb\nc\n");
    await s.read();
    const text = await s.edit([{ insert_after: { anchor: `1:${h("a")}`, new_text: "x" } }]);
    expect(text).toContain(
      "Line numbers shifted by +1 from old line 2; 2 earlier anchors there are stale (edit remaps them when unambiguous and refuses otherwise).",
    );
  });

  it("uses a negative shift and the singular after a deletion", async () => {
    const s = session("delete.txt", "a\nb\nc\n");
    await s.read();
    const text = await s.edit([{ set_line: { anchor: `2:${h("b")}`, new_text: "" } }]);
    expect(text).toContain(
      "Line numbers shifted by -1 from old line 3; 1 earlier anchor there is stale (edit remaps them when unambiguous and refuses otherwise).",
    );
  });

  it("says nothing for a same-line-count edit", async () => {
    const s = session("same.txt", "a\nb\nc\n");
    await s.read();
    const text = await s.edit([{ set_line: { anchor: `2:${h("b")}`, new_text: "B" } }]);
    expect(text).not.toContain("Line numbers shifted");
  });
});

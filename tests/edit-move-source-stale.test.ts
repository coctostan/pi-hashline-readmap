import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => {
  await ensureHashInit();
});

const h = (text: string) => computeLineHash(1, text);

// Two files read through the extension, then a cross-file move_lines from source.txt into target.txt.
function session() {
  const dir = mkdtempSync(join(tmpdir(), "move-source-"));
  writeFileSync(join(dir, "source.txt"), "a\nb\nc\nd\ne\n", "utf8");
  writeFileSync(join(dir, "target.txt"), "x\ny\n", "utf8");
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
  const messages: any[] = [];
  let next = 0;
  async function call(name: string, params: Record<string, unknown>) {
    const tool = tools.get(name);
    const id = `${name}-${next++}`;
    const args = tool.prepareArguments ? tool.prepareArguments(params) : params;
    await handlers.tool_call?.({ type: "tool_call", toolName: name, toolCallId: id, input: args }, { cwd: dir });
    const result: any = await tool.execute(id, args, new AbortController().signal, undefined, { cwd: dir });
    const event = { type: "tool_result", toolName: name, toolCallId: id, input: args, content: result.content, details: result.details, isError: result.isError === true };
    const patched = await handlers.tool_result?.(event, { cwd: dir });
    const final = patched ? { ...result, ...patched } : result;
    messages.push({ role: "toolResult", toolCallId: id, toolName: name, content: final.content, details: final.details, isError: final.isError === true, timestamp: next });
    const text = (final.content as Array<{ type: string; text?: string }>).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
    return { id, text, isError: final.isError === true };
  }
  return {
    read: (path: string) => call("read", { path }),
    edit: (path: string, edits: unknown[]) => call("edit", { path, edits }),
    move: () =>
      call("edit", {
        path: "target.txt",
        edits: [{ move_lines: { from_path: "source.txt", start_anchor: `2:${h("b")}`, end_anchor: `3:${h("c")}`, after_anchor: `1:${h("x")}` } }],
      }),
    context: () => handlers.context({ type: "context", messages }, {})?.messages ?? messages,
    bytes: (path: string) => readFileSync(join(dir, path), "utf8"),
  };
}

describe("a cross-file move_lines and its source's earlier read", () => {
  it("marks the source's earlier read stale at the next context event", async () => {
    const s = session();
    const sourceRead = await s.read("source.txt");
    await s.read("target.txt");
    expect((await s.move()).isError).toBe(false);

    const shown = s.context().find((message: any) => message.toolCallId === sourceRead.id);
    expect(shown.details.contextHygieneStale).toMatchObject({ status: "stale", originalTool: "read", originalResultId: sourceRead.id });
  });

  it("names the source's earlier read in the move's own context-hygiene notice", async () => {
    const s = session();
    await s.read("source.txt");
    await s.read("target.txt");

    const moved = await s.move();
    expect(moved.text).toContain("[Context hygiene] 2 earlier tool results no longer reflect current state");
    expect(moved.text).toMatch(/- read \(file:[^)]*\/source\.txt\)/);
  });

  it("still lands an anchored edit of the source with a pre-move anchor, without a re-read", async () => {
    const s = session();
    await s.read("source.txt");
    await s.read("target.txt");
    await s.move();

    const res = await s.edit("source.txt", [{ set_line: { anchor: `5:${h("e")}`, new_text: "E" } }]);
    expect(res.isError).toBe(false);
    expect(s.bytes("source.txt")).toBe("a\nd\nE\n");
    expect(s.bytes("target.txt")).toBe("x\nb\nc\ny\n");
  });
});

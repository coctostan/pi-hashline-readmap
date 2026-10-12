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

function session(fileName: string, fixture: string) {
  const dir = mkdtempSync(join(tmpdir(), "edit-shifted-"));
  const file = join(dir, fileName);
  writeFileSync(file, fixture, "utf8");
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
    const text = (final.content as Array<{ type: string; text?: string }>).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
    return { text, isError: final.isError === true, details: final.details };
  }
  return {
    read: () => call("read", { path: fileName }),
    edit: (edits: unknown[]) => call("edit", { path: fileName, edits }),
    bytes: () => readFileSync(file, "utf8"),
    mutate: (content: string) => writeFileSync(file, content, "utf8"),
  };
}

describe("edit after a line-shifting edit to the same file", () => {
  it("refuses the issue #271 stale anchor instead of editing the first brace", async () => {
    const s = session("braces.txt", "a\n}\n}\nb\n");
    await s.read();
    expect((await s.edit([{ insert_after: { anchor: `1:${h("a")}`, new_text: "x" } }])).isError).toBe(false);

    const stale = await s.edit([{ set_line: { anchor: `3:${h("}")}`, new_text: "SECOND_BRACE_EDIT" } }]);
    expect(stale.isError).toBe(true);
    expect(stale.details.ptcValue.error.code).toBe("hash-mismatch");
    expect(stale.text).toContain(`>>> 4:${h("}")}|}`);
    expect(s.bytes()).toBe("a\nx\n}\n}\nb\n");

    const retry = await s.edit([{ set_line: { anchor: `4:${h("}")}`, new_text: "SECOND_BRACE_EDIT" } }]);
    expect(retry.isError).toBe(false);
    expect(s.bytes()).toBe("a\nx\n}\nSECOND_BRACE_EDIT\nb\n");
  });

  it("remaps a stale anchor whose old line number now holds different content", async () => {
    const s = session("remap.txt", "s\nt\n}\nu\n}\n");
    await s.read();
    await s.edit([{ insert_after: { anchor: `1:${h("s")}`, new_text: "x" } }]);
    const res = await s.edit([{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }]);
    expect(res.isError).toBe(false);
    expect(res.text).toContain(`Anchor 3:${h("}")} predates an earlier edit that moved its line; remapped to 4:${h("}")}.`);
    expect(s.bytes()).toBe("s\nx\nt\nZ\nu\n}\n");
  });

  it("keeps earlier anchors valid after a same-line-count edit", async () => {
    const s = session("same.txt", "a\n}\n}\nb\n");
    await s.read();
    await s.edit([{ set_line: { anchor: `1:${h("a")}`, new_text: "A" } }]);
    const res = await s.edit([{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }]);
    expect(res.isError).toBe(false);
    expect(res.text).not.toContain("predates");
    expect(s.bytes()).toBe("A\n}\nZ\nb\n");
  });

  it("keeps anchors above a shift valid", async () => {
    const s = session("above.txt", "a\nb\nc\n");
    await s.read();
    await s.edit([{ insert_after: { anchor: `2:${h("b")}`, new_text: "x" } }]);
    const res = await s.edit([{ set_line: { anchor: `1:${h("a")}`, new_text: "A" } }]);
    expect(res.isError).toBe(false);
    expect(s.bytes()).toBe("A\nb\nx\nc\n");
  });

  it("applies several anchors from one read in a single call", async () => {
    const s = session("multi.txt", "a\n}\n}\nb\n");
    await s.read();
    const res = await s.edit([
      { insert_after: { anchor: `1:${h("a")}`, new_text: "x" } },
      { set_line: { anchor: `3:${h("}")}`, new_text: "Z" } },
    ]);
    expect(res.isError).toBe(false);
    expect(s.bytes()).toBe("a\nx\n}\nZ\nb\n");
  });

  it("still refuses an anchor whose line changed on disk", async () => {
    const s = session("external.txt", "a\nb\nc\n");
    await s.read();
    s.mutate("a\nB\nc\n");
    const res = await s.edit([{ set_line: { anchor: `2:${h("b")}`, new_text: "Z" } }]);
    expect(res.isError).toBe(true);
    expect(res.details.ptcValue.error.code).toBe("hash-mismatch");
    expect(s.bytes()).toBe("a\nB\nc\n");
  });
});

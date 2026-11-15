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
const header = (count: number, tag: string) => Array.from({ length: count }, (_, i) => `${tag}${i + 1}`).join("\n") + "\n";

function session(fileName: string, fixture: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "write-shift-"));
  const file = join(dir, fileName);
  if (fixture !== null) writeFileSync(file, fixture, "utf8");
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
    write: (content: string) => call("write", { path: fileName, content }),
    edit: (edits: unknown[]) => call("edit", { path: fileName, edits }),
    bytes: () => readFileSync(file, "utf8"),
    mutate: (content: string) => writeFileSync(file, content, "utf8"),
  };
}

describe("edit after the extension's own write moved lines", () => {
  it("remaps an unchanged line's pre-write anchor 30 lines down", async () => {
    const s = session("far.txt", "alpha\nbeta\ngamma\n");
    await s.read();
    expect((await s.write(header(30, "h") + "alpha\nbeta\ngamma\n")).isError).toBe(false);

    const res = await s.edit([{ set_line: { anchor: `2:${h("beta")}`, new_text: "BETA" } }]);
    expect(res.isError).toBe(false);
    expect(res.text).toContain(`Anchor 2:${h("beta")} predates an earlier edit that moved its line; remapped to 32:${h("beta")}.`);
    expect(s.bytes()).toBe(header(30, "h") + "alpha\nBETA\ngamma\n");
  });

  it("refuses a pre-write anchor of a line the write changed, with fresh rows", async () => {
    const s = session("changed.txt", "alpha\nbeta\ngamma\n");
    await s.read();
    const written = header(30, "h") + "alpha\nBETA2\ngamma\n";
    await s.write(written);

    const res = await s.edit([{ set_line: { anchor: `2:${h("beta")}`, new_text: "x" } }]);
    expect(res.isError).toBe(true);
    expect(res.details.ptcValue.error.code).toBe("hash-mismatch");
    expect(res.text).toContain(`Anchor 2:${h("beta")} points at a line an earlier edit to this file replaced or removed`);
    expect(res.text).toContain(`2:${h("h2")}|h2`);
    expect(s.bytes()).toBe(written);
  });

  it("refuses a pre-write anchor of a line the write removed", async () => {
    const s = session("removed.txt", "alpha\nbeta\ngamma\n");
    await s.read();
    const written = header(30, "h") + "alpha\ngamma\n";
    await s.write(written);

    const res = await s.edit([{ set_line: { anchor: `2:${h("beta")}`, new_text: "x" } }]);
    expect(res.isError).toBe(true);
    expect(res.details.ptcValue.error.code).toBe("hash-mismatch");
    expect(res.text).toContain(`Anchor 2:${h("beta")} points at a line an earlier edit to this file replaced or removed`);
    expect(s.bytes()).toBe(written);
  });

  it("composes two successive writes: a pre-first-write anchor lands 60 lines down", async () => {
    const s = session("twice.txt", "alpha\nbeta\ngamma\n");
    await s.read();
    await s.write(header(30, "h") + "alpha\nbeta\ngamma\n");
    await s.write(header(30, "g") + header(30, "h") + "alpha\nbeta\ngamma\n");

    const res = await s.edit([{ set_line: { anchor: `2:${h("beta")}`, new_text: "BETA" } }]);
    expect(res.isError).toBe(false);
    expect(res.text).toContain(`remapped to 62:${h("beta")}.`);
    expect(s.bytes()).toBe(header(30, "g") + header(30, "h") + "alpha\nBETA\ngamma\n");
  });

  it("refuses an anchor whose old line number now holds identical content, and the retry lands", async () => {
    const s = session("same.txt", "x\n}\nb\n");
    await s.read();
    const written = "q\n}\n" + header(30, "h") + "x\n}\nb\n";
    await s.write(written);
    // Old line 2 ("}") moved to 34; line 2 now holds a new "}" the write added.
    const res = await s.edit([{ set_line: { anchor: `2:${h("}")}`, new_text: "Z" } }]);
    expect(res.isError).toBe(true);
    expect(res.details.ptcValue.error.code).toBe("hash-mismatch");
    expect(res.text).toContain(`predates an earlier edit that moved its line to 34, and line 2 now holds identical content, so it is ambiguous.`);
    expect(s.bytes()).toBe(written);

    const retry = await s.edit([{ set_line: { anchor: `34:${h("}")}`, new_text: "Z" } }]);
    expect(retry.isError).toBe(false);
    expect(s.bytes()).toBe("q\n}\n" + header(30, "h") + "x\nZ\nb\n");
  });

  it("after a write too large for anchors, a text replace is not judged against rows read before it", async () => {
    const s = session("large.txt", "a\nb\nc\n");
    await s.read();
    const written = "a\nUNIQUE\n" + header(2000, "h");
    const write = await s.write(written);
    expect(write.details.ptcValue.truncated).toBe(true);

    const res = await s.edit([{ replace: { old_text: "UNIQUE", new_text: "DONE" } }]);
    expect(res.isError).toBe(false);
    expect(s.bytes()).toBe("a\nDONE\n" + header(2000, "h"));
  });

  it("a range edit over a created file refuses an interior line another process changed", async () => {
    const s = session("created.txt", null);
    expect((await s.write("a\nb\nc\n")).isError).toBe(false);
    s.mutate("a\nB\nc\n");

    const res = await s.edit([{ replace_lines: { start_anchor: `1:${h("a")}`, end_anchor: `3:${h("c")}`, new_text: "x" } }]);
    expect(res.isError).toBe(true);
    expect(res.text).toContain(`>>> 2:${h("B")}|B`);
    expect(s.bytes()).toBe("a\nB\nc\n");
  });
});

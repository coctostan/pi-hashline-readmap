/**
 * An anchor of digits alone ("49", "37:") is a line number whose hash the model left out. It is
 * refused with that line's current row, never resolved as a bare hash. Expected rows come from the
 * read result for that line. Calls run through the extension entry point, as in Pi.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import init from "../index.js";
import { ensureHashInit } from "../src/hashline.js";

interface CallResult {
  text: string;
  isError: boolean;
  details: any;
}

function session(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "edit-digit-anchor-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf8");
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

  async function call(name: string, params: Record<string, unknown>): Promise<CallResult> {
    const tool = tools.get(name);
    const id = `call-${next++}`;
    handlers.context?.({ type: "context", messages: [] });
    const args = tool.prepareArguments ? tool.prepareArguments(params) : params;
    await handlers.tool_call?.({ type: "tool_call", toolName: name, toolCallId: id, input: args }, { cwd: dir });
    let result: any;
    try {
      result = await tool.execute(id, args, new AbortController().signal, undefined, { cwd: dir });
    } catch (error) {
      // Pi reports a thrown tool error to the model as an error result with its message.
      result = { content: [{ type: "text", text: (error as Error).message }], details: undefined, isError: true };
    }
    const event = { type: "tool_result", toolName: name, toolCallId: id, input: args, content: result.content, details: result.details, isError: result.isError === true };
    const patched = await handlers.tool_result?.(event, { cwd: dir });
    const final = patched ? { ...result, ...patched } : result;
    const text = (final.content as Array<{ type: string; text?: string }>)
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n");
    return { text, isError: final.isError === true, details: final.details };
  }

  return {
    read: (path: string) => call("read", { path }),
    edit: (path: string, edits: unknown[]) => call("edit", { path, edits }),
    bytes: (path: string) => readFileSync(join(dir, path), "utf8"),
    mutate: (path: string, content: string) => writeFileSync(join(dir, path), content, "utf8"),
  };
}

/** The `LINE:HASH|content` row for `line` in tool output. */
function row(text: string, line: number): string {
  const found = text.split("\n").map((l) => l.replace(/^(?:>>> |\s+)/, "")).find((l) => l.startsWith(`${line}:`));
  if (!found) throw new Error(`no row for line ${line} in:\n${text}`);
  return found;
}

const anchorOf = (shownRow: string) => shownRow.split("|")[0];

beforeAll(async () => {
  await ensureHashInit();
});

describe("a digit-only edit anchor", () => {
  it.each(["2", "2:"])("set_line %j is refused with line 2's current row and writes nothing", async (digits) => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    const line2 = row((await s.read("f.txt")).text, 2);
    const result = await s.edit("f.txt", [{ set_line: { anchor: digits, new_text: "BBB" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain(line2);
    expect(result.text).toMatch(/"2" is a line number without a hash/);
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
  });

  const fields: Array<[string, (a: Record<number, string>) => unknown]> = [
    ["replace_lines.start_anchor", (a) => ({ replace_lines: { start_anchor: "2", end_anchor: a[3], new_text: "X" } })],
    ["replace_lines.end_anchor", (a) => ({ replace_lines: { start_anchor: a[1], end_anchor: "2", new_text: "X" } })],
    ["insert_after.anchor", () => ({ insert_after: { anchor: "2", new_text: "X" } })],
    ["copy_lines.start_anchor", (a) => ({ copy_lines: { start_anchor: "2", end_anchor: a[3], after_anchor: a[3] } })],
    ["copy_lines.end_anchor", (a) => ({ copy_lines: { start_anchor: a[1], end_anchor: "2", after_anchor: a[3] } })],
    ["copy_lines.after_anchor", (a) => ({ copy_lines: { start_anchor: a[1], end_anchor: a[1], after_anchor: "2" } })],
    ["move_lines.start_anchor", (a) => ({ move_lines: { start_anchor: "2", end_anchor: a[2], after_anchor: a[3] } })],
    ["move_lines.end_anchor", (a) => ({ move_lines: { start_anchor: a[1], end_anchor: "2", after_anchor: a[3] } })],
    ["move_lines.after_anchor", (a) => ({ move_lines: { start_anchor: a[1], end_anchor: a[1], after_anchor: "2" } })],
  ];
  it.each(fields)("in %s is refused with line 2's current row and writes nothing", async (_field, build) => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    const shown = (await s.read("f.txt")).text;
    const anchors = { 1: anchorOf(row(shown, 1)), 2: anchorOf(row(shown, 2)), 3: anchorOf(row(shown, 3)) };
    const result = await s.edit("f.txt", [build(anchors)]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain(row(shown, 2));
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
  });

  it("is a line number even when it equals another line's hash", async () => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    const bbbHash = anchorOf(row((await s.read("f.txt")).text, 2)).split(":")[1];
    expect(bbbHash).toMatch(/^\d{3}$/); // fixture premise: bbb's hash is all digits
    const result = await s.edit("f.txt", [{ set_line: { anchor: bbbHash, new_text: "BBB" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(new RegExp(`line ${bbbHash} does not exist`, "i"));
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
  });

  it.each(["0", "0:"])("%j says line 0 does not exist", async (zero) => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    await s.read("f.txt");
    const result = await s.edit("f.txt", [{ set_line: { anchor: zero, new_text: "X" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/line 0 does not exist/i);
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
  });

  it("past the end of the file says the line does not exist", async () => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    await s.read("f.txt");
    const result = await s.edit("f.txt", [{ set_line: { anchor: "9", new_text: "X" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/line 9 does not exist/i);
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
  });

  it("on the last line shows that row, and one past it (the final newline) does not exist", async () => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    const line3 = row((await s.read("f.txt")).text, 3);
    const last = await s.edit("f.txt", [{ set_line: { anchor: "3", new_text: "X" } }]);
    expect(last.isError).toBe(true);
    expect(last.text).toContain(line3);
    const past = await s.edit("f.txt", [{ set_line: { anchor: "4", new_text: "X" } }]);
    expect(past.isError).toBe(true);
    expect(past.text).toMatch(/line 4 does not exist/i);
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
  });

  it("is not reported as a changed line, while a stale anchor beside it still is", async () => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\nddd\neee\nfff\ngggg\n" });
    const shown = (await s.read("f.txt")).text;
    const alone = await s.edit("f.txt", [{ set_line: { anchor: "2", new_text: "X" } }]);
    expect(alone.text).not.toMatch(/changed since last read/);
    s.mutate("f.txt", "aaa\nbbb\nccc\nddd\neee\nfff\nGGGG\n");
    const mixed = await s.edit("f.txt", [
      { set_line: { anchor: "2", new_text: "X" } },
      { set_line: { anchor: anchorOf(row(shown, 7)), new_text: "Y" } },
    ]);
    expect(mixed.isError).toBe(true);
    expect(mixed.text).toMatch(/1 line has changed since last read/);
    expect(mixed.text).toContain(row(shown, 2));
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\nddd\neee\nfff\nGGGG\n");
  });

  it("shows a row the retry can use without a re-read, even after the line changed on disk", async () => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n" });
    await s.read("f.txt");
    s.mutate("f.txt", "aaa\nbxb\nccc\n");
    const refused = await s.edit("f.txt", [{ set_line: { anchor: "2", new_text: "BBB" } }]);
    expect(refused.isError).toBe(true);
    const retry = await s.edit("f.txt", [{ set_line: { anchor: anchorOf(row(refused.text, 2)), new_text: "BBB" } }]);
    expect(retry.isError).toBe(false);
    expect(s.bytes("f.txt")).toBe("aaa\nBBB\nccc\n");
  });

  it("in a copy_lines source file is refused with the source's row and writes nothing", async () => {
    const s = session({ "f.txt": "aaa\nbbb\nccc\n", "src.txt": "xxx\nyyy\n" });
    const target = (await s.read("f.txt")).text;
    const sourceLine2 = row((await s.read("src.txt")).text, 2);
    const result = await s.edit("f.txt", [{ copy_lines: { from_path: "src.txt", start_anchor: "2", end_anchor: "2", after_anchor: anchorOf(row(target, 3)) } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain(sourceLine2);
    expect(s.bytes("f.txt")).toBe("aaa\nbbb\nccc\n");
    expect(s.bytes("src.txt")).toBe("xxx\nyyy\n");
  });
});

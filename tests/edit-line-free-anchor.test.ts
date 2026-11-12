/**
 * An anchor missing its line number (a bare "HASH" or "HASH|content") is refused at parse time,
 * even when exactly one line carries that hash, and writes nothing. A digit-only anchor past the
 * end gets the same message a numbered anchor does. Expected messages come from the unused-code
 * (Code nothing uses is gone) arc's first done-when check. Calls run through the extension entry
 * point, as in Pi.
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
}

function session(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "edit-unnumbered-anchor-"));
  writeFileSync(join(dir, "f.txt"), content, "utf8");
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
      result = { content: [{ type: "text", text: (error as Error).message }], isError: true };
    }
    const text = (result.content as Array<{ type: string; text?: string }>)
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n");
    return { text, isError: result.isError === true };
  }

  return {
    read: () => call("read", { path: "f.txt" }),
    edit: (edits: unknown[]) => call("edit", { path: "f.txt", edits }),
    bytes: () => readFileSync(join(dir, "f.txt"), "utf8"),
  };
}

/** The `LINE:HASH` anchor of `line` in read output. */
function anchorOf(text: string, line: number): string {
  const row = text.split("\n").find((l) => l.startsWith(`${line}:`));
  if (!row) throw new Error(`no row for line ${line} in:\n${text}`);
  return row.split("|")[0];
}

const FILE = "aaa\nbbb\nccc\n";

beforeAll(async () => {
  await ensureHashInit();
});

describe("an edit anchor missing its line number", () => {
  const fields: Array<[string, (free: string, a: Record<number, string>) => unknown]> = [
    ["set_line.anchor", (free) => ({ set_line: { anchor: free, new_text: "X" } })],
    ["replace_lines.start_anchor", (free, a) => ({ replace_lines: { start_anchor: free, end_anchor: a[3], new_text: "X" } })],
    ["replace_lines.end_anchor", (free, a) => ({ replace_lines: { start_anchor: a[1], end_anchor: free, new_text: "X" } })],
    ["insert_after.anchor", (free) => ({ insert_after: { anchor: free, new_text: "X" } })],
    ["copy_lines.start_anchor", (free, a) => ({ copy_lines: { start_anchor: free, end_anchor: a[3], after_anchor: a[3] } })],
    ["copy_lines.end_anchor", (free, a) => ({ copy_lines: { start_anchor: a[1], end_anchor: free, after_anchor: a[3] } })],
    ["copy_lines.after_anchor", (free, a) => ({ copy_lines: { start_anchor: a[1], end_anchor: a[1], after_anchor: free } })],
    ["move_lines.start_anchor", (free, a) => ({ move_lines: { start_anchor: free, end_anchor: a[2], after_anchor: a[3] } })],
    ["move_lines.end_anchor", (free, a) => ({ move_lines: { start_anchor: a[1], end_anchor: free, after_anchor: a[3] } })],
    ["move_lines.after_anchor", (free, a) => ({ move_lines: { start_anchor: a[1], end_anchor: a[1], after_anchor: free } })],
  ];
  const forms: Array<[string, (hash: string) => string]> = [
    ["HASH", (hash) => hash],
    ["HASH|content", (hash) => `${hash}|ccc`],
  ];

  for (const [form, shape] of forms) {
    it.each(fields)(`${form} in %s is refused as an invalid line reference and writes nothing`, async (_field, build) => {
      const s = session(FILE);
      const shown = (await s.read()).text;
      const anchors = { 1: anchorOf(shown, 1), 2: anchorOf(shown, 2), 3: anchorOf(shown, 3) };
      const hash = anchors[3].split(":")[1];
      // Fixture premise: line 3's hash is unique and not all digits, so it can only be read as a hash.
      expect(hash).toMatch(/[a-f]/);
      expect([anchors[1], anchors[2]].map((a) => a.split(":")[1])).not.toContain(hash);
      const free = shape(hash);
      const result = await s.edit([build(free, anchors)]);
      expect(result.isError).toBe(true);
      expect(result.text).toContain(`Invalid line reference "${free}". Expected "LINE:HASH" (e.g. "5:abc").`);
      expect(s.bytes()).toBe(FILE);
    });
  }
});

describe("a digit-only edit anchor past the end of the file", () => {
  it.each([
    ["9", 9],
    ["4", 4], // the empty element after the final newline
  ])("%j says the line does not exist in the numbered anchor's words", async (digits, line) => {
    const s = session(FILE);
    await s.read();
    const result = await s.edit([{ set_line: { anchor: digits, new_text: "X" } }]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Line ${line} does not exist (file has 3 lines). Re-read the file for current anchors.`);
    expect(s.bytes()).toBe(FILE);
  });
});

/**
 * `insert_after` with an empty `new_text` inserts one blank line; `set_line` with a trailing
 * newline still sets only its own line.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function harness(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "edit-blank-"));
  writeFileSync(join(dir, "lines.txt"), content);
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
    handlers.context?.({ type: "context", messages: [] });
    const args = tool.prepareArguments ? tool.prepareArguments(params) : params;
    await handlers.tool_call?.({ type: "tool_call", toolName: name, toolCallId: id, input: args }, { cwd: dir });
    const result = await tool.execute(id, args, new AbortController().signal, undefined, { cwd: dir });
    await handlers.tool_result?.(
      { type: "tool_result", toolName: name, toolCallId: id, input: args, content: result.content, details: result.details, isError: result.isError === true },
      { cwd: dir },
    );
    const text = result.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
    return { text, isError: result.isError === true };
  }
  const file = () => readFileSync(join(dir, "lines.txt"), "utf8");
  return { call, file };
}

const anchor = (line: number, content: string) => `${line}:${computeLineHash(line, content)}`;

describe("insert_after with an empty new_text", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it.each([
    ["new_text alone", { new_text: "" }],
    ["an empty text alias too", { new_text: "", text: "" }],
    ["literal", { new_text: "", literal: true }],
  ])("inserts one empty line after its anchor (%s)", async (_name, fields) => {
    const { call, file } = harness("a\nb\nc\n");
    await call("read", { path: "lines.txt" });
    const result = await call("edit", { path: "lines.txt", edits: [{ insert_after: { anchor: anchor(1, "a"), ...fields } }] });
    expect(result.isError).toBe(false);
    expect(result.text).not.toContain("No changes made");
    expect(file()).toBe("a\n\nb\nc\n");
  });

  it("inserts after the last line", async () => {
    const { call, file } = harness("a\nb\n");
    await call("read", { path: "lines.txt" });
    await call("edit", { path: "lines.txt", edits: [{ insert_after: { anchor: anchor(2, "b"), new_text: "" } }] });
    expect(file()).toBe("a\nb\n\n");
  });

  it("inserts one blank line into an empty file", async () => {
    const { call, file } = harness("");
    await call("read", { path: "lines.txt" });
    const result = await call("edit", { path: "lines.txt", edits: [{ insert_after: { anchor: anchor(1, ""), new_text: "" } }] });
    expect(result.text).not.toContain("No changes made");
    expect(file()).toBe("\n");
  });

  it("still prefers a non-empty text alias", async () => {
    const { call, file } = harness("a\nb\n");
    await call("read", { path: "lines.txt" });
    await call("edit", { path: "lines.txt", edits: [{ insert_after: { anchor: anchor(1, "a"), new_text: "", text: "x" } }] });
    expect(file()).toBe("a\nx\nb\n");
  });

  it("leaves set_line with a trailing newline setting that line alone", async () => {
    const { call, file } = harness("a\nb\nc\n");
    await call("read", { path: "lines.txt" });
    await call("edit", { path: "lines.txt", edits: [{ set_line: { anchor: anchor(2, "b"), new_text: "x\n" } }] });
    expect(file()).toBe("a\nx\nc\n");
  });
});

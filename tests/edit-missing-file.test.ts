/**
 * An anchored edit on a path that doesn't exist reports the file as missing, naming the path as
 * given and where it resolved, instead of asking for fresh anchors of a file nobody can read.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import init from "../index.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "edit-missing-"));
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
    return { text, isError: result.isError === true, code: result.details?.ptcValue?.error?.code };
  }
  return { dir, call };
}

describe("edit on a missing file", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it.each([
    ["set_line", (a: string) => ({ set_line: { anchor: a, new_text: "x" } })],
    ["insert_after", (a: string) => ({ insert_after: { anchor: a, new_text: "x" } })],
    ["replace_symbol", () => ({ replace_symbol: { symbol: "alpha", new_body: "function alpha() {}" } })],
  ])("%s fails file-not-found naming the given and resolved paths", async (_name, make) => {
    const { dir, call } = harness();
    const result = await call("edit", { path: "src/missing.ts", edits: [make(`1:${computeLineHash(1, "x")}`)] });
    expect(result.isError).toBe(true);
    expect(result.code).toBe("file-not-found");
    expect(result.text).toContain("src/missing.ts");
    expect(result.text).toContain(join(dir, "src/missing.ts"));
    expect(result.text).not.toContain("fresh anchors");
    expect(existsSync(join(dir, "src/missing.ts"))).toBe(false);
  });

  it("a missing move_lines source fails file-not-found and leaves the target untouched", async () => {
    const { dir, call } = harness();
    writeFileSync(join(dir, "target.ts"), "const x = 1;\n");
    await call("read", { path: "target.ts" });
    const anchor = `1:${computeLineHash(1, "const x = 1;")}`;
    const result = await call("edit", {
      path: "target.ts",
      edits: [{ move_lines: { from_path: "gone.ts", start_anchor: anchor, end_anchor: anchor, after_anchor: anchor } }],
    });
    expect(result.code).toBe("file-not-found");
    expect(result.text).toContain("gone.ts");
    expect(result.text).toContain(join(dir, "gone.ts"));
    expect(readFileSync(join(dir, "target.ts"), "utf8")).toBe("const x = 1;\n");
  });

  it("an existing file not yet read still fails file-not-read", async () => {
    const { dir, call } = harness();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/here.ts"), "aaa\n");
    const result = await call("edit", { path: "src/here.ts", edits: [{ set_line: { anchor: `1:${computeLineHash(1, "aaa")}`, new_text: "b" } }] });
    expect(result.code).toBe("file-not-read");
    expect(readFileSync(join(dir, "src/here.ts"), "utf8")).toBe("aaa\n");
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Value } from "typebox/value";
import init from "../index.js";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function harness() {
  const cwd = mkdtempSync(join(tmpdir(), "repro-262-"));
  directories.push(cwd);
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({
    registerTool(definition: any) { tools.set(definition.name, definition); },
    on(event: string, handler: Function) { handlers[event] = handler; },
    events: { emit() {}, on() {} },
  } as any);
  let id = 0;
  async function call(name: string, input: Record<string, unknown>, nested = true) {
    const toolCallId = `repro-${++id}`;
    const parent = nested ? { parentToolCallId: "script" } : {};
    await handlers.tool_call({ type: "tool_call", toolName: name, toolCallId, input, ...parent }, { cwd });
    const tool = tools.get(name);
    const result = await tool.execute(toolCallId, input, undefined, undefined, { cwd });
    const override = await handlers.tool_result({
      ...result, type: "tool_result", toolName: name, toolCallId, input, ...parent,
    }, { cwd });
    return { ...result, ...override };
  }
  async function finishScript() {
    const result = await handlers.tool_result({
      type: "tool_result", toolName: "codemode", toolCallId: "script", input: {},
      content: [{ type: "text", text: "true" }], details: {}, isError: false,
    }, { cwd });
    return result?.content.map((item: any) => item.text ?? "").join("\n") ?? "true";
  }
  return { cwd, tools, call, finishScript };
}

it.each([
  [4, 3, "unknown", 0], [3, 3, "unknown", 0],
  [2, 3, "complete", 0], [0, 3, "complete", 0],
  [60, 100, "complete", 50],
] as const)("exposes grep completeness for count=%i limit=%i", async (count, limit, search, omitted) => {
  const { cwd, call } = harness();
  writeFileSync(join(cwd, "many.txt"), "needle\n".repeat(count));
  const result = await call("grep", { path: "many.txt", pattern: "needle", limit });
  const value = result.structuredContent;
  expect(result.isError).not.toBe(true);
  if (!value.completeness) throw new Error("Grep completeness is missing");
  expect(value.completeness).toMatchObject({
    search, limitReached: count >= limit, nativeTruncated: false,
    omittedMatches: omitted, displayTruncated: false,
  });
  expect(value.totalMatches).toBe(Math.min(count, limit));
  expect(value.records.filter((r: any) => r.kind === "match")).toHaveLength(Math.min(count, limit) - omitted);
  expect(value.records.every((r: any) => r.raw === "needle")).toBe(true);
  expect(result.details.ptcValue.records.every((r: any) => !("raw" in r))).toBe(true);
});

it("preserves completeness and compact records in summary mode", async () => {
  const { cwd, call } = harness();
  writeFileSync(join(cwd, "many.txt"), "needle\n".repeat(60));
  const result = await call("grep", { path: "many.txt", pattern: "needle", summary: true, limit: 100 });
  const value = result.structuredContent;
  expect(value.totalMatches).toBe(60);
  const matches = value.records.filter((r: any) => r.kind === "match");
  expect(new Set(matches.map((r: any) => JSON.stringify([r.path, r.line]))).size).toBe(10);
  expect(value.completeness).toMatchObject({ search: "complete", omittedMatches: 50 });
  expect(value.records.every((r: any) => r.raw === "needle")).toBe(true);
  expect(result.details.ptcValue.records.every((r: any) => !("raw" in r))).toBe(true);
});

it("counts unique scoped match records without losing raw source", async () => {
  const { cwd, call } = harness();
  const source = ["export function first() {", "  const a = 'needle';", "  return 'needle';", "}"];
  writeFileSync(join(cwd, "scope.ts"), source.join("\n") + "\n");
  const result = await call("grep", { path: "scope.ts", pattern: "needle", scope: "symbol", scopeContext: 0 });
  const value = result.structuredContent;
  expect(value.totalMatches).toBe(2);
  const uniqueMatches = new Set(value.records
    .filter((r: any) => r.kind === "match")
    .map((r: any) => JSON.stringify([r.path, r.line])));
  expect(uniqueMatches.size).toBe(2);
  expect(value.completeness.search).toBe("complete");
  expect(value.completeness.omittedMatches).toBe(value.totalMatches - uniqueMatches.size);
  expect(value.records.every((r: any) => r.raw === source[r.line - 1])).toBe(true);
  expect(result.details.ptcValue.records.every((r: any) => !("raw" in r))).toBe(true);
});

// Adopt the original image discovery regression; images need no text-range fields.
it("advertises the successful image value returned to codemode", () => {
  const { tools } = harness();
  const imageValue = {
    text: "Read image file [image/png]", type: "image", data: "aGVsbG8=",
    mimeType: "image/png", note: "Read image file [image/png]",
  };
  expect(Value.Check(tools.get("read").outputSchema, imageValue)).toBe(true);
});

// Adopt the original private write→read→edit regression; nested anchor safety must survive.
it("does not warn about a read kept entirely private inside a script", async () => {
  const { call, finishScript } = harness();
  await call("write", { path: "private.ts", content: "export const value = 1;\n" });
  const read = await call("read", { path: "private.ts" });
  const edit = await call("edit", { path: "private.ts", edits: [
    { set_line: { anchor: read.structuredContent.lines[0].anchor, new_text: "export const value = 2;" } },
  ] });
  expect(edit.structuredContent.ok).toBe(true);
  expect(await finishScript()).not.toContain("[Stale read result");
});

it("still warns when a nested edit invalidates a model-visible read", async () => {
  const { cwd, call, finishScript } = harness();
  writeFileSync(join(cwd, "visible.ts"), "export const value = 1;\n");
  const read = await call("read", { path: "visible.ts" }, false);
  await call("edit", { path: "visible.ts", edits: [
    { set_line: { anchor: read.structuredContent.lines[0].anchor, new_text: "export const value = 2;" } },
  ] });
  expect(await finishScript()).toContain("[Stale read result");
});

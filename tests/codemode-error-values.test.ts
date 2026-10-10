import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { Value } from "typebox/value";
import { Type } from "typebox";
import init from "../index.js";
import { applyCodemodeIntegration } from "../src/codemode-integration.js";

const directories: string[] = [];
afterEach(() => {
  for (const cwd of directories.splice(0)) rmSync(cwd, { recursive: true, force: true });
});
function harness() {
  const cwd = mkdtempSync(join(tmpdir(), "codemode-errors-"));
  directories.push(cwd);
  const tools = new Map<string, any>();
  const handlers: Record<string, Function> = {};
  init({ registerTool(t: any) { tools.set(t.name, t); }, on(n: string, h: Function) { handlers[n] = h; },
    events: { emit() {}, on() {} } } as any);
  let n = 0;
  const call = async (name: string, args: any) => {
    const id = "script/" + n++;
    const result = await tools.get(name).execute(id, args, undefined, undefined, { cwd });
    const override = await handlers.tool_result({ ...result, type: "tool_result", toolName: name, toolCallId: id,
      parentToolCallId: "script", input: args }, { cwd });
    return { ...result, ...override };
  };
  return { cwd, tools, call };
}

it("opts into a coded missing-file execute value", async () => {
  const { call, tools } = harness();
  const missing = await call("read", { path: "missing.ts", errorMode: "value" });
  if (!missing.structuredContent?.error?.code) throw new Error("Opt-in failure code is missing");
  expect(missing.structuredContent).toMatchObject({ tool: "read", ok: false, error: { code: "file-not-found" } });
  expect(missing.isError).toBe(true);
  expect(Value.Check(tools.get("read").outputSchema, missing.structuredContent)).toBe(true);
});

it.each([{}, { errorMode: "throw" }])("retains the default rejection surface (%j)", async mode => {
  const { call } = harness();
  const result = await call("read", { path: "missing.ts", ...mode });
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
});

it("exposes execute-owned invalid-input codes", async () => {
  const { call } = harness();
  const invalid = await call("read", { path: "a.ts", offset: -1, errorMode: "value" });
  expect(invalid.structuredContent.error.code).toBe("invalid-offset");
});

it("does not bypass required-null preparation", () => {
  const { tools } = harness();
  expect(() => tools.get("read").prepareArguments({ path: null, errorMode: "value" }))
    .toThrow("Invalid path: expected string, received null.");
});

it("returns a stale-hash code without changing file bytes", async () => {
  const { call, cwd } = harness();
  writeFileSync(join(cwd, "a.ts"), "const a = 1;\nconst b = 2;\n");
  const old = (await call("read", { path: "a.ts" })).structuredContent;
  const before = "const a = 9;\nconst b = 2;\n";
  writeFileSync(join(cwd, "a.ts"), before);
  const conflict = await call("edit", { path: "a.ts", errorMode: "value", edits: [
    { set_line: { anchor: old.lines[0].anchor, new_text: "const a = 3;" } },
  ] });
  expect(conflict.structuredContent.error.code).toBe("hash-mismatch");
  expect(readFileSync(join(cwd, "a.ts"), "utf8")).toBe(before);
});

it("returns an overlap code atomically", async () => {
  const { call, cwd, tools } = harness();
  const before = "const a = 9;\nconst b = 2;\n";
  writeFileSync(join(cwd, "a.ts"), before);
  const fresh = (await call("read", { path: "a.ts" })).structuredContent;
  const overlap = await call("edit", { path: "a.ts", errorMode: "value", edits: [
    { replace_lines: { start_anchor: fresh.lines[0].anchor, end_anchor: fresh.lines[1].anchor, new_text: "gone" } },
    { replace_lines: { start_anchor: fresh.lines[1].anchor, end_anchor: fresh.lines[1].anchor, new_text: "conflict" } },
  ] });
  expect(overlap.structuredContent).toMatchObject({ ok: false, error: { code: "overlapping-edit" } });
  expect(Value.Check(tools.get("edit").outputSchema, overlap.structuredContent)).toBe(true);
  expect(readFileSync(join(cwd, "a.ts"), "utf8")).toBe(before);
});

it("leaves successful values unchanged in value mode", async () => {
  const { call, cwd } = harness();
  writeFileSync(join(cwd, "a.ts"), "const a = 9;\n");
  const normal = await call("read", { path: "a.ts" });
  const optedIn = await call("read", { path: "a.ts", errorMode: "value" });
  expect(optedIn.structuredContent).toEqual(normal.structuredContent);
});

it("does not catch arbitrary thrown host exceptions", async () => {
  const tool: any = applyCodemodeIntegration({
    name: "read", label: "", description: "", parameters: Type.Object({}),
    async execute() { throw new Error("host abort"); },
  });
  await expect(tool.execute("x", { errorMode: "value" })).rejects.toThrow("host abort");
});

it("does not invent values for uncoded errors", async () => {
  const tool: any = applyCodemodeIntegration({
    name: "read", label: "", description: "", parameters: Type.Object({}),
    async execute() { return { isError: true, content: [{ type: "text", text: "blocked" }], details: {} }; },
  } as any);
  expect((await tool.execute("x", { errorMode: "value" })).structuredContent).toBeUndefined();
});

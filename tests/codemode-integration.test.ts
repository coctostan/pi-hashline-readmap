import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import init from "../index.js";
import {
  HASHLINE_TOOL_OUTPUT_SCHEMAS,
  buildStructuredContent,
  isNestedToolEvent,
} from "../src/codemode-integration.js";

function createHarness() {
  const handlers: Record<string, Function> = {};
  const tools = new Map<string, any>();
  init(
    {
      registerTool(definition: any) {
        tools.set(definition.name, definition);
      },
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
      events: { emit() {}, on() {} },
    } as any,
  );
  return { handlers, tools };
}

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "pi-codemode-integration-"));
  writeFileSync(join(dir, "sample.ts"), "export const alpha = 1;\nexport const beta = alpha + 1;\n", "utf8");
  return dir;
}

const exec = (tool: any, params: Record<string, unknown>, cwd: string) =>
  tool.execute("call-1", params, new AbortController().signal, () => {}, { cwd });

describe("Pi codemode integration", () => {
  it("declares annotations and output schemas for Hashline tools", () => {
    const { tools } = createHarness();
    for (const name of ["read", "grep", "ls", "find"]) {
      expect(tools.get(name).annotations).toEqual({ readOnlyHint: true, openWorldHint: false });
      expect(tools.get(name).outputSchema).toBe(HASHLINE_TOOL_OUTPUT_SCHEMAS[name]);
    }
    expect(tools.get("edit").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(tools.get("write").annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    // Arbitrary-command tools keep Pi's conservative defaults and their own output contract.
    expect(tools.get("bash").annotations).toBeUndefined();
    if (tools.has("nu")) {
      expect(tools.get("nu").annotations).toBeUndefined();
      expect(tools.get("nu").outputSchema).toBeUndefined();
    }
    // The raw-argument guard still wraps the same definition.
    expect(typeof tools.get("read").prepareArguments).toBe("function");
  });

  it("returns { text, ...ptcValue } as structuredContent for successful reads", async () => {
    const { tools } = createHarness();
    const cwd = fixtureDir();
    const result = await exec(tools.get("read"), { path: "sample.ts" }, cwd);
    expect(result.isError).not.toBe(true);
    const text = result.content.find((item: any) => item.type === "text").text;
    expect(result.structuredContent.text).toBe(text);
    expect(result.structuredContent.tool).toBe("read");
    expect(result.structuredContent.lines[0]).toMatchObject({ line: 1, raw: "export const alpha = 1;" });
    expect(result.structuredContent.lines[0].anchor).toMatch(/^1:[0-9a-f]+$/);
    // Persisted details are unchanged.
    expect(result.details.ptcValue.lines).toEqual(result.structuredContent.lines);
    expect(() => JSON.stringify(result.structuredContent)).not.toThrow();
  });

  it("gives scripts raw grep lines without growing persisted details", async () => {
    const { tools } = createHarness();
    const cwd = fixtureDir();
    const result = await exec(tools.get("grep"), { pattern: "alpha", path: "sample.ts", literal: true }, cwd);
    expect(result.structuredContent.totalMatches).toBe(2);
    expect(result.structuredContent.records.map((record: any) => record.raw)).toEqual([
      "export const alpha = 1;",
      "export const beta = alpha + 1;",
    ]);
    expect(result.details.ptcValue.records.every((record: any) => !("raw" in record))).toBe(true);
    expect(typeof result.structuredContent.text).toBe("string");
  });

  it("leaves error results without structuredContent so codemode rejects with the error text", async () => {
    const { tools } = createHarness();
    const cwd = fixtureDir();
    const result = await exec(tools.get("read"), { path: "missing.ts" }, cwd);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(buildStructuredContent({ isError: true, content: [], structuredContent: { a: 1 } })).toBeUndefined();
  });

  it("does not count codemode-issued calls toward doom-loop warnings or prefix their results", async () => {
    const { handlers } = createHarness();
    const nestedEvent = (n: number) => ({
      type: "tool_result" as const,
      toolName: "read",
      toolCallId: `script/${n}`,
      parentToolCallId: "script",
      input: { path: "src/read.ts" },
      content: [{ type: "text" as const, text: "plain output" }],
      structuredContent: { text: "plain output" },
      isError: false,
      details: {},
    });
    for (let n = 0; n < 5; n++) {
      const call = { type: "tool_call", toolName: "read", toolCallId: `script/${n}`, parentToolCallId: "script", input: { path: "src/read.ts" } };
      await handlers.tool_call(call, {});
      expect(await handlers.tool_result(nestedEvent(n), {})).toBeUndefined();
    }
    // A model-issued call afterwards is not flagged by the script's repetitions.
    await handlers.tool_call({ type: "tool_call", toolName: "read", toolCallId: "model-1", input: { path: "src/read.ts" } }, {});
    const direct = await handlers.tool_result({ ...nestedEvent(0), toolCallId: "model-1", parentToolCallId: undefined }, {});
    expect(direct).toBeUndefined();
  });

  it("detects nested tool events by parentToolCallId", () => {
    expect(isNestedToolEvent({ parentToolCallId: "abc" })).toBe(true);
    expect(isNestedToolEvent({ parentToolCallId: "" })).toBe(false);
    expect(isNestedToolEvent({})).toBe(false);
    expect(isNestedToolEvent(undefined)).toBe(false);
  });
});

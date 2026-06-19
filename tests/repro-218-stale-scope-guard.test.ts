import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit, computeLineHash } from "../src/hashline.js";
import init from "../index.js";

function createHarness() {
  const tools: Record<string, any> = {};
  const handlers: Record<string, Function> = {};
  init({
    registerTool(def: any) { tools[def.name] = def; },
    on(event: string, handler: Function) { handlers[event] = handler; },
    events: { emit() {}, on() {} },
  } as any);
  return { tools, handlers };
}

describe("issue 218 — stale masking stays file-scoped", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("masks the edited file's own read but NOT a prior read of unrelated file B", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-218-scope-"));
    const fileA = resolve(dir, "a.ts");
    const fileB = resolve(dir, "b.ts");
    writeFileSync(fileA, ["a1", "uniqueA", "a3"].join("\n") + "\n", "utf-8");
    writeFileSync(fileB, ["b1", "b2", "b3"].join("\n") + "\n", "utf-8");

    const { tools, handlers } = createHarness();

    // Read BOTH files so each edit-before-read guard is satisfied and edit-A records a
    // real mutation event (a failed/unread edit emits no contextHygiene, so it would mask
    // nothing and the test would pass vacuously).
    const readA = await tools.read.execute("read-A", { path: fileA }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await handlers.tool_result({ toolName: "read", toolCallId: "read-A", input: { path: fileA }, content: readA.content, isError: false, details: readA.details }, {});

    const readB = await tools.read.execute("read-B", { path: fileB }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await handlers.tool_result({ toolName: "read", toolCallId: "read-B", input: { path: fileB }, content: readB.content, isError: false, details: readB.details }, {});

    const anchorA = `2:${computeLineHash(2, "uniqueA")}`;
    const editA = await tools.edit.execute("edit-A", { path: fileA, edits: [{ set_line: { anchor: anchorA, new_text: "uniqueAv2" } }] }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    // The edit must actually apply — this is what records the mutation event for file A.
    expect(editA.isError).not.toBe(true);
    await handlers.tool_result({ toolName: "edit", toolCallId: "edit-A", input: { path: fileA }, content: editA.content, isError: false, details: editA.details }, {});

    const ctx = handlers.context!({
      type: "context",
      messages: [
        { role: "toolResult", toolCallId: "read-A", toolName: "read", content: [{ type: "text", text: "A read output" }], details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 1 },
        { role: "toolResult", toolCallId: "read-B", toolName: "read", content: [{ type: "text", text: "B read output" }], details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 2 },
        { role: "toolResult", toolCallId: "edit-A", toolName: "edit", content: [{ type: "text", text: "edit succeeded" }], details: { ptcValue: { tool: "edit" } }, isError: false, timestamp: 3 },
      ],
    }, {});

    // read-A (same resource as the edit) IS masked — proving a mutation was recorded …
    const maskedA = ctx?.messages?.[0]?.content?.[0]?.text ?? "";
    expect(maskedA).toContain("Stale read result");
    expect(maskedA.toLowerCase()).toContain("content-derived");
    // … while the unrelated read-B is left untouched — proving file-scoped keying holds.
    // If a future change broke the resource-keying (e.g. masked all reads), this fails.
    expect(ctx?.messages?.[1]?.content?.[0]?.text).toBe("B read output");
  });

  it("editing the same file B DOES mask the prior read of B with the clarified wording", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-218-same-"));
    const fileB = resolve(dir, "b.ts");
    writeFileSync(fileB, ["b1", "uniqueB", "b3"].join("\n") + "\n", "utf-8");

    const { tools, handlers } = createHarness();

    const readB = await tools.read.execute("read-B", { path: fileB }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await handlers.tool_result({ toolName: "read", toolCallId: "read-B", input: { path: fileB }, content: readB.content, isError: false, details: readB.details }, {});

    const anchorB = `2:${computeLineHash(2, "uniqueB")}`;
    const editB = await tools.edit.execute("edit-B", { path: fileB, edits: [{ set_line: { anchor: anchorB, new_text: "uniqueBv2" } }] }, new AbortController().signal, () => {}, { cwd: process.cwd() });
    await handlers.tool_result({ toolName: "edit", toolCallId: "edit-B", input: { path: fileB }, content: editB.content, isError: false, details: editB.details }, {});

    const ctx = handlers.context!({
      type: "context",
      messages: [
        { role: "toolResult", toolCallId: "read-B", toolName: "read", content: [{ type: "text", text: "B read output" }], details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 1 },
        { role: "toolResult", toolCallId: "edit-B", toolName: "edit", content: [{ type: "text", text: "edit succeeded" }], details: { ptcValue: { tool: "edit" } }, isError: false, timestamp: 2 },
      ],
    }, {});
    const masked = ctx?.messages?.[0]?.content?.[0]?.text ?? "";
    expect(masked).toContain("Stale read result");
    expect(masked.toLowerCase()).toContain("content-derived");
  });
});

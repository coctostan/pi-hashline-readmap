import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import init from "../index.js";

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

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

describe("issue 144 — fresh re-read survives a subsequent context turn", () => {
  it("read → edit → context-mask → read → context-turn → edit(fresh anchor) succeeds", async () => {

    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-144-rehydrate-"));
    const filePath = resolve(dir, "small.ts");
    writeFileSync(filePath, ["a", "b", "uniqueLine", "d", "e"].join("\n") + "\n", "utf-8");

    const { tools, handlers } = createHarness();

    // 1. Live read.
    const readResult1 = await tools.read.execute(
      "read-1", { path: filePath },
      new AbortController().signal, () => {}, { cwd: process.cwd() },
    );
    await handlers.tool_result({
      toolName: "read", toolCallId: "read-1", input: { path: filePath },
      content: readResult1.content, isError: false, details: readResult1.details,
    }, {});

    // 2. Live edit (mutation).
    const liveAnchor = `3:${computeLineHash(3, "uniqueLine")}`;
    const editResult1 = await tools.edit.execute(
      "edit-1",
      { path: filePath, edits: [{ set_line: { anchor: liveAnchor, new_text: "uniqueLineV2" } }] },
      new AbortController().signal, () => {}, { cwd: process.cwd() },
    );
    expect(editResult1.isError).not.toBe(true);
    await handlers.tool_result({
      toolName: "edit", toolCallId: "edit-1", input: { path: filePath },
      content: editResult1.content, isError: false, details: editResult1.details,
    }, {});

    // 3. First provider-context turn — masks the prior read; readTurns entry expires.
    handlers.context!({
      type: "context",
      messages: [
        {
          role: "toolResult", toolCallId: "read-1", toolName: "read",
          content: [{ type: "text", text: "old read output" }],
          details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 1,
        },
        {
          role: "toolResult", toolCallId: "edit-1", toolName: "edit",
          content: [{ type: "text", text: "edit succeeded" }],
          details: { ptcValue: { tool: "edit" } }, isError: false, timestamp: 2,
        },
      ],
    }, {});

    // 4. Fresh re-read — must restore the live-anchor view.
    const readResult2 = await tools.read.execute(
      "read-2", { path: filePath },
      new AbortController().signal, () => {}, { cwd: process.cwd() },
    );
    expect(readResult2.isError).not.toBe(true);
    await handlers.tool_result({
      toolName: "read", toolCallId: "read-2", input: { path: filePath },
      content: readResult2.content, isError: false, details: readResult2.details,
    }, {});

    // 5. Second provider-context turn — runs the same staleCandidates check
    //    again. The fresh re-read's readTurns entry MUST survive this turn,
    //    otherwise edit-2 below would be wrongly rejected as "must get fresh
    //    anchors". This is the assertion that catches off-by-one bugs in
    //    noteRead's eventId arithmetic.
    handlers.context!({
      type: "context",
      messages: [
        {
          role: "toolResult", toolCallId: "read-1", toolName: "read",
          content: [{ type: "text", text: "old read output" }],
          details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 1,
        },
        {
          role: "toolResult", toolCallId: "edit-1", toolName: "edit",
          content: [{ type: "text", text: "edit succeeded" }],
          details: { ptcValue: { tool: "edit" } }, isError: false, timestamp: 2,
        },
        {
          role: "toolResult", toolCallId: "read-2", toolName: "read",
          content: [{ type: "text", text: "fresh read output" }],
          details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 3,
        },
      ],
    }, {});

    // 6. Edit with a *fresh, valid* anchor (line 3 now reads "uniqueLineV2").
    const freshAnchor = `3:${computeLineHash(3, "uniqueLineV2")}`;
    const editResult2 = await tools.edit.execute(
      "edit-2",
      { path: filePath, edits: [{ set_line: { anchor: freshAnchor, new_text: "uniqueLineV3" } }] },
      new AbortController().signal, () => {}, { cwd: process.cwd() },
    );

    expect(editResult2.isError).not.toBe(true);
    expect(getTextContent(editResult2)).toContain(`Edited ${filePath}`);
    expect(readFileSync(filePath, "utf-8"))
      .toBe(["a", "b", "uniqueLineV3", "d", "e"].join("\n") + "\n");
  });
});

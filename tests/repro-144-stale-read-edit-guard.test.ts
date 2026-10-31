// Regression test for issue 144.
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensureHashInit, computeLineHash } from "../src/hashline.js";
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

describe("issue 144 — stale-masked read must not satisfy edit's must-read guard", () => {
  it("rejects edit-with-fake-hash after the prior read has been stale-masked", async () => {
    await ensureHashInit();

    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-144-"));
    const filePath = resolve(dir, "small.ts");
    writeFileSync(filePath, ["a", "b", "uniqueLine", "d", "e"].join("\n") + "\n", "utf-8");

    const { tools, handlers } = createHarness();

    // 1. Live read — feeds tracker via the tool_result handler.
    const readResult = await tools.read.execute(
      "read-1",
      { path: filePath },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    expect(readResult.isError).not.toBe(true);
    await handlers.tool_result({
      toolName: "read",
      toolCallId: "read-1",
      input: { path: filePath },
      content: readResult.content,
      isError: false,
      details: readResult.details,
    }, {});

    // 2. External mutation (bash) — also feeds tracker. The extension's own edit or write keeps
    //    the view fresh (ServedLines remaps its shifts, ruling 0004); a change it did not make does not.
    writeFileSync(filePath, ["a", "b", "uniqueLineV2", "d", "e"].join("\n") + "\n", "utf-8");
    await handlers.tool_result({
      toolName: "bash",
      toolCallId: "bash-1",
      input: { command: `sed -i 's/uniqueLine/uniqueLineV2/' ${filePath}` },
      content: [{ type: "text", text: "" }],
      isError: false,
      details: {},
    }, {});

    // 3. Provider-context turn — masks the prior read into the stale placeholder.
    const ctxResult = handlers.context!({
      type: "context",
      messages: [
        {
          role: "toolResult", toolCallId: "read-1", toolName: "read",
          content: [{ type: "text", text: "old read output" }],
          details: { ptcValue: { tool: "read" } }, isError: false, timestamp: 1,
        },
        {
          role: "toolResult", toolCallId: "bash-1", toolName: "bash",
          content: [{ type: "text", text: "" }],
          details: {}, isError: false, timestamp: 2,
        },
      ],
    }, {});
    expect(ctxResult.messages[0].details.contextHygieneStale).toMatchObject({
      status: "stale",
      originalTool: "read",
      originalResultId: "read-1",
    });

    // 4. Edit with a structurally-valid LINE:HASH whose hash matches a *different*
    //    line — adaptive relocation would silently land it. The fix must intercept
    //    earlier: the read-before-edit guard must reject because the file no longer
    //    has any visible live anchors in this session.
    const fakeAnchor = `1:${computeLineHash(2, "b")}`;
    const editResult2 = await tools.edit.execute(
      "edit-2",
      { path: filePath, edits: [{ set_line: { anchor: fakeAnchor, new_text: "INJECTED" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editResult2.isError).toBe(true);
    expect(getTextContent(editResult2))
      .toContain(`You must get fresh anchors for ${filePath} before editing it.`);
    expect(readFileSync(filePath, "utf-8"))
      .toBe(["a", "b", "uniqueLineV2", "d", "e"].join("\n") + "\n");
  });
});

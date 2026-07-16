import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import init from "../index.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  renderStaleReadPlaceholder,
  resetContextHygieneTracker,
} from "../src/context-hygiene.js";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
} from "../src/hashline-settings.js";

const tempRoots: string[] = [];
function createHarness() {
  const handlers: Record<string, Function> = {};

  init({
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  } as any);

  return handlers;
}

function toolResult(toolCallId: string, toolName: string, text: string, details: Record<string, unknown> = {}) {
  return {
    role: "toolResult" as const,
    toolCallId,
    toolName,
    content: [{ type: "text" as const, text }],
    details,
    isError: false,
    timestamp: 1,
  };
}

afterEach(() => {
  delete (globalThis as any).__hashlineToolExecutors;
  __resetHashlineSettingsPathsForTest();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("context hygiene provider context handler", () => {
  it("masks stale prior tool results in the provider-context copy without mutating source messages", async () => {
    const handlers = createHarness();
    expect(typeof handlers.context).toBe("function");

    const file = buildFileResource("src/read.ts");
    const readMetadata = buildContextHygieneMetadata({
      tool: "read",
      classification: "read-context",
      resources: [file],
    });
    const editMetadata = buildContextHygieneMetadata({
      tool: "edit",
      classification: "mutation",
      resources: [file],
    });

    await handlers.tool_result({
      type: "tool_result" as const,
      toolName: "read",
      toolCallId: "read-before-edit",
      input: { path: "src/read.ts" },
      content: [{ type: "text" as const, text: "old read output" }],
      isError: false,
      details: { contextHygiene: readMetadata, ptcValue: { tool: "read" } },
    }, {});
    await handlers.tool_result({
      type: "tool_result" as const,
      toolName: "edit",
      toolCallId: "edit-file",
      input: { path: "src/read.ts" },
      content: [{ type: "text" as const, text: "edit succeeded" }],
      isError: false,
      details: { contextHygiene: editMetadata, ptcValue: { tool: "edit" } },
    }, {});

    const readMessage = toolResult("read-before-edit", "read", "old read output", { ptcValue: { tool: "read" } });
    const editMessage = toolResult("edit-file", "edit", "edit succeeded", { ptcValue: { tool: "edit" } });
    const providerContextCopy = [readMessage, editMessage];

    const result = handlers.context({ type: "context", messages: providerContextCopy }, {});

    expect(result.messages[0].content).toEqual([
      { type: "text", text: "[Stale read result — this earlier read was superseded by a later file change; nothing is wrong with read. Edits still validate against current on-disk content via content-derived LINE:HASH anchors, so a matching hash still applies. Re-run read for fresh anchors.]" },
    ]);
    expect(result.messages[0].details).toMatchObject({
      ptcValue: { tool: "read" },
      contextHygieneStale: { status: "stale", originalTool: "read", originalResultId: "read-before-edit" },
    });
    expect(result.messages[1]).toBe(editMessage);
    expect(providerContextCopy[0].content).toEqual([{ type: "text", text: "old read output" }]);
  });


  it("uses append-only settings without rewriting the historical provider prefix", async () => {
    const root = mkdtempSync(join(tmpdir(), "hashline-context-handler-"));
    tempRoots.push(root);
    const projectSettingsPath = join(root, "project-settings.json");
    writeFileSync(projectSettingsPath, JSON.stringify({ contextHygiene: { staleResults: "append-only" } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "missing-global-settings.json"),
      projectSettingsPath,
    });

    const handlers = createHarness();
    const file = buildFileResource("src/read.ts");
    const readMetadata = buildContextHygieneMetadata({
      tool: "read",
      classification: "read-context",
      resources: [file],
    });
    const editMetadata = buildContextHygieneMetadata({
      tool: "edit",
      classification: "mutation",
      resources: [file],
    });

    await handlers.tool_result({
      type: "tool_result" as const,
      toolName: "read",
      toolCallId: "read-before-edit",
      input: { path: "src/read.ts" },
      content: [{ type: "text" as const, text: "old read output" }],
      isError: false,
      details: { contextHygiene: readMetadata },
    }, {});
    const editPatch = await handlers.tool_result({
      type: "tool_result" as const,
      toolName: "edit",
      toolCallId: "edit-file",
      input: { path: "src/read.ts" },
      content: [{ type: "text" as const, text: "edit succeeded" }],
      isError: false,
      details: { contextHygiene: editMetadata },
    }, {});
    expect(editPatch.details.contextHygiene.appliedEffects).toEqual({
      retired: { count: 0, resultIds: [], reasons: [] },
      stale: {
        count: 1,
        resultIds: ["read-before-edit"],
        reasons: ["mutation-after-read"],
      },
      notices: [{
        resultId: "read-before-edit",
        text: renderStaleReadPlaceholder(),
      }],
    });

    const readMessage = toolResult("read-before-edit", "read", "old read output");
    const editMessage = {
      ...toolResult("edit-file", "edit", "edit succeeded"),
      details: editPatch.details,
    };
    const providerContextCopy = [readMessage, editMessage];
    resetContextHygieneTracker();

    const result = handlers.context({ type: "context", messages: providerContextCopy }, {});

    expect(result.messages[0]).toBe(readMessage);
    expect(result.messages[1].content).toEqual([
      { type: "text", text: "edit succeeded" },
      { type: "text", text: renderStaleReadPlaceholder() },
    ]);
  });
});

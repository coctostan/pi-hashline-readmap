import { describe, expect, it } from "vitest";
import {
  annotateRetiredToolResultMessage,
  annotateStaleToolResultMessage,
} from "../src/context-application.js";
import {
  buildRetiredContextRecord,
  buildStaleContextRecord,
} from "../src/context-hygiene.js";

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

describe("context hygiene annotation preserves provider-visible content", () => {
  it("annotates a stale message in details without touching content", () => {
    const record = buildStaleContextRecord({
      originalTool: "read",
      originalEventId: 1,
      originalResultId: "read-a",
      staleResourceKeys: ["file:src/a.ts"],
      invalidatingMutationEventId: 2,
      invalidatingMutationResultId: "edit-a",
      reason: "mutation-after-read",
    });
    const message = toolResult("read-a", "read", "1:07e|import x;", { ptcValue: { tool: "read" } });

    const annotated = annotateStaleToolResultMessage(message, record);

    expect(annotated.content).toEqual([{ type: "text", text: "1:07e|import x;" }]);
    expect(annotated.details).toMatchObject({
      ptcValue: { tool: "read" },
      contextHygieneStale: {
        status: "stale",
        originalTool: "read",
        originalResultId: "read-a",
        reason: "mutation-after-read",
      },
    });
    expect(message.content).toEqual([{ type: "text", text: "1:07e|import x;" }]);
    expect(message.details).not.toHaveProperty("contextHygieneStale");
  });

  it("annotates a retired message in details without touching content", () => {
    const record = buildRetiredContextRecord({
      originalTool: "bash",
      originalEventId: 1,
      originalResultId: "log-old",
      retiredResourceKeys: ["command:vcs:git log"],
      supersededByEventId: 2,
      supersededByResultId: "log-new",
      reason: "same-command-success-rerun",
      command: "git log",
    });
    const message = toolResult("log-old", "bash", "old history", { compressionInfo: { technique: "git" } });

    const annotated = annotateRetiredToolResultMessage(message, record);

    expect(annotated.content).toEqual([{ type: "text", text: "old history" }]);
    expect(annotated.details).toMatchObject({
      compressionInfo: { technique: "git" },
      contextHygieneRetired: {
        status: "retired",
        originalTool: "bash",
        originalResultId: "log-old",
        reason: "same-command-success-rerun",
      },
    });
    expect(message.content).toEqual([{ type: "text", text: "old history" }]);
  });
});

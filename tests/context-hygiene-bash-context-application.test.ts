import { describe, expect, it } from "vitest";
import { buildBashCommandState } from "../src/bash-command-state.js";
import { applyContextHygieneStaleContext } from "../src/context-application.js";
import {
  buildCommandResource,
  buildContextHygieneMetadata,
  buildFileResource,
  createContextHygieneTracker,
} from "../src/context-hygiene.js";

function bashMetadata(command: string, text: string, isError = false) {
  return buildContextHygieneMetadata({
    tool: "bash",
    classification: "command-output",
    resources: [buildCommandResource(command)],
    commandState: buildBashCommandState({ command, text, isError }),
  });
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

describe("Bash context hygiene context application", () => {
  it("masks stale Bash repo-state output while preserving details", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/example.ts");

    tracker.record(bashMetadata("git status --short", " M src/example.ts"), { resultId: "status-before" });
    tracker.record(buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }), { resultId: "edit-file" });

    const staleStatus = toolResult("status-before", "bash", " M src/example.ts", {
      existing: { source: "kept" },
      contextHygiene: { tool: "bash" },
      bashContextGuard: { trimmed: false },
      bashOriginalOutput: { source: "pi-visible" },
    });
    const edit = toolResult("edit-file", "edit", "edit succeeded");

    const applied = applyContextHygieneStaleContext([staleStatus, edit], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Stale bash context: bash-repo-state-after-mutation. Re-run the Bash command to refresh. Command: git status --short]" },
    ]);
    expect(applied[0].details).toMatchObject({
      existing: { source: "kept" },
      contextHygiene: { tool: "bash" },
      bashContextGuard: { trimmed: false },
      bashOriginalOutput: { source: "pi-visible" },
      contextHygieneStale: {
        status: "stale",
        originalTool: "bash",
        originalResultId: "status-before",
        invalidatingMutationResultId: "edit-file",
        reason: "bash-repo-state-after-mutation",
      },
    });
    expect(applied[1]).toBe(edit);
  });

  it("masks retired Bash output and leaves the latest same-command success live", () => {
    const tracker = createContextHygieneTracker();

    tracker.record(bashMetadata("git log --oneline -5", "old history"), { resultId: "log-old" });
    tracker.record(bashMetadata("git log --oneline -5", "new history"), { resultId: "log-new" });

    const oldLog = toolResult("log-old", "bash", "old history", { existing: { source: "kept" } });
    const newLog = toolResult("log-new", "bash", "new history");

    const applied = applyContextHygieneStaleContext([oldLog, newLog], tracker.generateReport());

    expect(applied[0].content).toEqual([
      { type: "text", text: "[Retired bash context: same-command-success-rerun. Superseded by a later successful Bash command. Command: git log --oneline -5]" },
    ]);
    expect(applied[0].details).toMatchObject({
      existing: { source: "kept" },
      contextHygieneRetired: {
        status: "retired",
        originalTool: "bash",
        originalResultId: "log-old",
        supersededByResultId: "log-new",
        reason: "same-command-success-rerun",
      },
    });
    expect(applied[1]).toBe(newLog);
    expect(applied[1].content).toEqual([{ type: "text", text: "new history" }]);
  });
});

import { describe, expect, it } from "vitest";
import init from "../index.js";
import { buildBashCommandState } from "../src/bash-command-state.js";
import {
  buildCommandResource,
  buildContextHygieneMetadata,
  buildFileResource,
  getContextHygieneTracker,
} from "../src/context-hygiene.js";

function createHarness() {
  const handlers: Record<string, Function> = {};

  init(
    {
      registerTool() {},
      on(event: string, handler: Function) {
        handlers[event] = handler;
      },
      events: { emit() {}, on() {} },
    } as any,
  );

  return handlers;
}

describe("bash contextHygiene metadata", () => {
  it("attaches command-output metadata, records reruns, and preserves rendered output plus compressionInfo", async () => {
    const handlers = createHarness();
    const command = "npm test -- --context-hygiene-bash-task8";
    const expectedContextHygiene = {
      schemaVersion: 1,
      tool: "bash",
      classification: "command-output",
      resources: [buildCommandResource(command)],
      commandState: buildBashCommandState({ command, text: "PASS", isError: false }),
    };

    const first = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "bash-hygiene-1",
        input: { command },
        content: [{ type: "text" as const, text: "\u001b[32mPASS\u001b[0m" }],
        isError: false,
        details: { existing: "kept" },
      },
      {},
    );
    const second = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "bash-hygiene-2",
        input: { command },
        content: [{ type: "text" as const, text: "PASS" }],
        isError: false,
      },
      {},
    );

    expect(first).toBeDefined();
    expect(first.content).toEqual([{ type: "text", text: "PASS" }]);
    expect(first.details).toMatchObject({
      existing: "kept",
      compressionInfo: { technique: "test-output" },
    });
    expect(first.details.contextHygiene).toEqual(expectedContextHygiene);
    expect((first.details.ptcValue as any)?.contextHygiene).toBeUndefined();

    expect(second.content).toHaveLength(1);
    expect(second.content[0].text).toContain("[Context hygiene]");
    expect(second.content[0].text.endsWith("---\nPASS")).toBe(true);

    expect(second.details.contextHygiene).toMatchObject(expectedContextHygiene);
    expect((second.details.contextHygiene as any).appliedEffects).toEqual({
      retired: {
        count: 1,
        resultIds: ["bash-hygiene-1"],
        reasons: ["same-command-success-rerun"],
      },
      stale: {
        count: 0,
        resultIds: [],
        reasons: [],
      },
    });

    const commandRerun = getContextHygieneTracker()
      .generateReport()
      .commandReruns.find((entry) => entry.resourceKey === buildCommandResource(command).key);

    expect(commandRerun).toEqual({
      resourceKey: "command:test:npm test -- --context-hygiene-bash-task8",
      count: 2,
      eventIds: expect.any(Array),
      resultIds: ["bash-hygiene-1", "bash-hygiene-2"],
    });
    expect(commandRerun?.eventIds).toHaveLength(2);
  });

  it("reports repo-state bash output staled by a later bash mutation in the current turn", async () => {
    const handlers = createHarness();
    const status = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "status-before-mutation",
        input: { command: "git status --short" },
        content: [{ type: "text" as const, text: " M src/example.ts" }],
        isError: false,
      },
      {},
    );
    const mutation = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "bash-file-mutation-after-status",
        input: { command: "printf changed > tmp/context-hygiene-current-turn.txt" },
        content: [{ type: "text" as const, text: "" }],
        isError: false,
      },
      {},
    );

    expect(status.details.contextHygiene.commandState.stateKind).toBe("repo-status");
    expect(mutation.details.contextHygiene.commandState.stateKind).toBe("shell-file-mutation");
    expect(mutation.content).toHaveLength(1);
    expect(mutation.content[0].text).toContain("[Context hygiene]");
    expect(mutation.content[0].text.endsWith("---\n")).toBe(true);
    expect((mutation.details.contextHygiene as any).appliedEffects).toEqual({
      retired: {
        count: 0,
        resultIds: [],
        reasons: [],
      },
      stale: {
        count: 1,
        resultIds: ["status-before-mutation"],
        reasons: ["bash-repo-state-after-mutation"],
      },
    });

    const report = getContextHygieneTracker().generateReport();
    expect(report.staleCandidates.flatMap((candidate) => candidate.staleResults)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalTool: "bash",
          originalResultId: "status-before-mutation",
          invalidatingMutationResultId: "bash-file-mutation-after-status",
          reason: "bash-repo-state-after-mutation",
        }),
      ]),
    );
  });

  it("reports failed verification output staled by an exact successful rerun in the current turn", async () => {
    const handlers = createHarness();
    const command = "npm test -- --context-hygiene-current-turn";
    const failure = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "verification-failure-before-success",
        input: { command },
        content: [{ type: "text" as const, text: "FAIL tests/current-turn.test.ts" }],
        isError: true,
      },
      {},
    );
    const success = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "verification-success-after-failure",
        input: { command },
        content: [{ type: "text" as const, text: "PASS tests/current-turn.test.ts" }],
        isError: false,
      },
      {},
    );

    expect(failure.details.contextHygiene.commandState).toMatchObject({
      stateKind: "verification",
      outcome: "failure",
    });
    expect(success.details.contextHygiene.commandState).toMatchObject({
      stateKind: "verification",
      outcome: "success",
    });
    expect(success.content).toHaveLength(1);
    expect(success.content[0].text).toContain("[Context hygiene]");
    expect(success.content[0].text.endsWith("---\nPASS tests/current-turn.test.ts")).toBe(true);
    expect((success.details.contextHygiene as any).appliedEffects).toEqual({
      retired: {
        count: 0,
        resultIds: [],
        reasons: [],
      },
      stale: {
        count: 1,
        resultIds: ["verification-failure-before-success"],
        reasons: ["bash-verification-success-rerun"],
      },
    });

    const report = getContextHygieneTracker().generateReport();
    expect(report.staleCandidates.flatMap((candidate) => candidate.staleResults)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalTool: "bash",
          originalResultId: "verification-failure-before-success",
          invalidatingMutationResultId: "verification-success-after-failure",
          reason: "bash-verification-success-rerun",
        }),
      ]),
    );
  });

  it("records shell redirection file targets so prior reads can become stale", async () => {
    const handlers = createHarness();
    const targetPath = `${process.cwd()}/tmp/context-hygiene-bash-shell-target.txt`;
    const fileResource = buildFileResource(targetPath);

    await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "read",
        toolCallId: "read-before-shell-mutation",
        input: { path: targetPath },
        content: [{ type: "text" as const, text: "old content" }],
        isError: false,
        details: {
          contextHygiene: buildContextHygieneMetadata({
            tool: "read",
            classification: "read-context",
            resources: [fileResource],
          }),
        },
      },
      {},
    );

    const command = `printf changed > ${targetPath}`;
    const result = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "bash-shell-redirection",
        input: { command },
        content: [{ type: "text" as const, text: "" }],
        isError: false,
      },
      {},
    );

    expect(result.details.contextHygiene.resources).toEqual(expect.arrayContaining([fileResource]));
    expect(result.details.contextHygiene).toMatchObject({
      tool: "bash",
      classification: "mutation",
      commandState: {
        stateKind: "shell-file-mutation",
        routineRetirementEligible: false,
        protectedFromRoutineRetirement: true,
        fileTargets: [targetPath],
      },
    });

    const report = getContextHygieneTracker().generateReport();
    expect(report.staleCandidates.flatMap((candidate) => candidate.staleResults)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          originalTool: "read",
          originalResultId: "read-before-shell-mutation",
          invalidatingMutationResultId: "bash-shell-redirection",
          reason: "mutation-after-read",
        }),
      ]),
    );
  });


  it("leaves unsafe shell expansion commands as command-only bash output", async () => {
    const handlers = createHarness();
    const command = "printf changed > $OUT_FILE";
    const result = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "bash",
        toolCallId: "bash-unsafe-expansion",
        input: { command },
        content: [{ type: "text" as const, text: "" }],
        isError: false,
      },
      {},
    );

    expect(result.details.contextHygiene.classification).toBe("command-output");
    expect(result.details.contextHygiene).toMatchObject({
      tool: "bash",
      resources: [buildCommandResource(command)],
      commandState: {
        normalizedCommand: command,
        stateKind: "debug",
      },
    });
  });

  it("records contextHygiene metadata from non-bash tool_result events without changing the event", async () => {
    const handlers = createHarness();
    const metadata = buildContextHygieneMetadata({
      tool: "read",
      classification: "read-context",
      resources: [buildFileResource("tmp/context-hygiene-bash-non-bash.ts")],
    });

    const first = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "read",
        toolCallId: "read-hygiene-1",
        input: { path: "tmp/context-hygiene-bash-non-bash.ts" },
        content: [{ type: "text" as const, text: "plain output" }],
        isError: false,
        details: { contextHygiene: metadata },
      },
      {},
    );
    const second = await handlers.tool_result(
      {
        type: "tool_result" as const,
        toolName: "read",
        toolCallId: "read-hygiene-2",
        input: { path: "tmp/context-hygiene-bash-non-bash.ts" },
        content: [{ type: "text" as const, text: "plain output" }],
        isError: false,
        details: { contextHygiene: metadata },
      },
      {},
    );

    expect(first).toBeUndefined();
    expect(second).toBeUndefined();

    const readReuse = getContextHygieneTracker()
      .generateReport()
      .readReuse.find((entry) => entry.resourceKey === "file:tmp/context-hygiene-bash-non-bash.ts");

    expect(readReuse).toEqual({
      resourceKey: "file:tmp/context-hygiene-bash-non-bash.ts",
      count: 2,
      eventIds: expect.any(Array),
      resultIds: ["read-hygiene-1", "read-hygiene-2"],
    });
    expect(readReuse?.eventIds).toHaveLength(2);
  });


  it("handles bash tool_result events without input safely", async () => {
    const handlers = createHarness();

    expect(() => handlers.tool_result({
      type: "tool_result" as const,
      toolName: "bash",
      toolCallId: "bash-missing-input",
      content: [{ type: "text" as const, text: "plain output" }],
      isError: false,
    })).not.toThrow();

    const result = handlers.tool_result({
      type: "tool_result" as const,
      toolName: "bash",
      toolCallId: "bash-missing-input-2",
      content: [{ type: "text" as const, text: "plain output" }],
      isError: false,
    });

    expect(result).toMatchObject({
      content: [{ type: "text", text: "plain output" }],
      details: {
        contextHygiene: {
          schemaVersion: 1,
          tool: "bash",
          classification: "command-output",
          resources: [],
        },
      },
  });
  });


  it("ignores malformed non-bash contextHygiene metadata without polluting reports", async () => {
    const handlers = createHarness();
    const malformedMetadata = {
      schemaVersion: 1,
      tool: "read",
      classification: "read-context",
      resources: [null],
    };

    await handlers.tool_result({
      type: "tool_result" as const,
      toolName: "read",
      toolCallId: "malformed-hygiene-1",
      input: { path: "tmp/malformed.ts" },
      content: [{ type: "text" as const, text: "plain output" }],
      isError: false,
      details: { contextHygiene: malformedMetadata },
    });
    await handlers.tool_result({
      type: "tool_result" as const,
      toolName: "read",
      toolCallId: "malformed-hygiene-2",
      input: { path: "tmp/malformed.ts" },
      content: [{ type: "text" as const, text: "plain output" }],
      isError: false,
      details: { contextHygiene: malformedMetadata },
    });

    const report = getContextHygieneTracker().generateReport();
    expect(report.readReuse.some((entry) => (entry as any).resourceKey === undefined)).toBe(false);
  });
});

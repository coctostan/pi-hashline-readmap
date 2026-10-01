import { describe, expect, it } from "vitest";
import init from "../index.js";
import {
  buildCommandResource,
  buildContextHygieneMetadata,
  buildFileResource,
  buildReadRehydrateDescriptor,
  getContextHygieneTracker,
} from "../src/context-hygiene.js";

function withDebugEnv<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.PI_CONTEXT_HYGIENE_DEBUG;
  if (value === undefined) delete process.env.PI_CONTEXT_HYGIENE_DEBUG;
  else process.env.PI_CONTEXT_HYGIENE_DEBUG = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.PI_CONTEXT_HYGIENE_DEBUG;
    else process.env.PI_CONTEXT_HYGIENE_DEBUG = previous;
  }
}

function createHarness(debugEnv?: string) {
  return withDebugEnv(debugEnv, () => {
    const handlers: Record<string, Function> = {};
    const tools = new Map<string, any>();

    init(
      {
        registerTool(tool: any) {
          tools.set(tool.name, tool);
        },
        on(event: string, handler: Function) {
          handlers[event] = handler;
        },
        events: { emit() {}, on() {} },
      } as any,
    );

    return { handlers, tools };
  });
}

describe("context_hygiene_report debug tool", () => {
  it("is not registered by default", () => {
    const { tools } = createHarness(undefined);

    expect(tools.has("context_hygiene_report")).toBe(false);
  });

  it("is registered only when PI_CONTEXT_HYGIENE_DEBUG is explicitly 1", () => {
    const disabled = createHarness("0");
    expect(disabled.tools.has("context_hygiene_report")).toBe(false);

    const enabled = createHarness("1");
    expect(enabled.tools.has("context_hygiene_report")).toBe(true);
    expect(enabled.tools.get("context_hygiene_report").annotations).toMatchObject({ readOnlyHint: true });
  });

  it("returns deterministic stale and retirement fields without mutating tracker state", async () => {
    const { tools } = createHarness("1");
    const reportTool = tools.get("context_hygiene_report");
    expect(reportTool).toBeDefined();

    const fileResource = buildFileResource("tmp/context-hygiene-debug-tool-task9.ts");
    const commandResource = buildCommandResource("npm test -- --context-hygiene-debug-tool-task9");
    const tracker = getContextHygieneTracker();
    const readRehydrate = buildReadRehydrateDescriptor({ path: "tmp/context-hygiene-debug-tool-task9.ts" });

    const readEvent = tracker.record(
      buildContextHygieneMetadata({
        tool: "read",
        classification: "read-context",
        resources: [fileResource],
        rehydrate: readRehydrate,
      }),
      { resultId: "debug-tool-read-task9" },
    );
    const firstCommandEvent = tracker.record(
      buildContextHygieneMetadata({
        tool: "bash",
        classification: "command-output",
        resources: [commandResource],
      }),
      { resultId: "debug-tool-command-task9-a" },
    );
    const secondCommandEvent = tracker.record(
      buildContextHygieneMetadata({
        tool: "bash",
        classification: "command-output",
        resources: [commandResource],
      }),
      { resultId: "debug-tool-command-task9-b" },
    );
    const mutationEvent = tracker.record(
      buildContextHygieneMetadata({
        tool: "edit",
        classification: "mutation",
        resources: [fileResource],
      }),
      { resultId: "debug-tool-mutation-task9" },
    );

    const before = tracker.generateReport();
    const result = await reportTool.execute("context-hygiene-report-task9", {}, undefined, undefined, {});
    const after = tracker.generateReport();

    expect(after).toEqual(before);
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(before, null, 2) }]);
    expect(result.details.ptcValue).toEqual(before);

    expect(result.details.ptcValue.staleCandidates).toContainEqual({
      resourceKey: fileResource.key,
      staleEventIds: [readEvent.id],
      mutationEventId: mutationEvent.id,
      reason: "mutation-after-read",
      staleResults: [
        {
          status: "stale",
          originalTool: "read",
          originalEventId: readEvent.id,
          originalResultId: "debug-tool-read-task9",
          staleResourceKeys: [fileResource.key],
          invalidatingMutationEventId: mutationEvent.id,
          invalidatingMutationResultId: "debug-tool-mutation-task9",
          reason: "mutation-after-read",
          rehydrate: readRehydrate,
        },
      ],
    });
    expect(result.details.ptcValue.retirementCandidates).toContainEqual({
      resourceKey: commandResource.key,
      eventIds: [firstCommandEvent.id],
      supersededByEventId: secondCommandEvent.id,
      reason: "command-rerun",
    });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  collectPendingContextHygieneNotices,
  markContextHygieneNoticesAnnounced,
  resetContextHygieneNoticeLedger,
} from "../src/context-hygiene-notices.js";
import {
  buildRetiredContextRecord,
  buildStaleContextRecord,
  type ContextHygieneReport,
  type ContextHygieneRetiredRecord,
  type ContextHygieneStaleRecord,
} from "../src/context-hygiene.js";

type ResourceRecords = {
  stale: ContextHygieneStaleRecord;
  retired: ContextHygieneRetiredRecord;
};

function recordsForResource(suffix: "a" | "b", eventOffset: number): ResourceRecords {
  return {
    stale: buildStaleContextRecord({
      originalTool: "grep",
      originalEventId: 1,
      originalResultId: "grep-shared",
      staleResourceKeys: [`file:src/${suffix}.ts`],
      invalidatingMutationEventId: 10 + eventOffset,
      invalidatingMutationResultId: `edit-${suffix}`,
      reason: "mutation-after-read",
    }),
    retired: buildRetiredContextRecord({
      originalTool: "bash",
      originalEventId: 2,
      originalResultId: "bash-shared",
      retiredResourceKeys: [`command:test:workspace-${suffix}`],
      supersededByEventId: 20 + eventOffset,
      supersededByResultId: `bash-latest-${suffix}`,
      reason: "same-command-success-rerun",
      command: "npm test",
    }),
  };
}

function reportFor(resources: readonly ResourceRecords[]): ContextHygieneReport {
  const staleRecords = resources.map((resource) => resource.stale);
  const retiredRecords = resources.map((resource) => resource.retired);

  return {
    eventCount: 30,
    resourceCount: resources.length * 2,
    readReuse: [],
    commandReruns: [],
    mutationAfterRead: [],
    staleCandidates: staleRecords.map((record) => ({
      resourceKey: record.staleResourceKeys[0] ?? "",
      staleEventIds: [record.originalEventId ?? 0],
      mutationEventId: record.invalidatingMutationEventId,
      reason: record.reason,
      staleResults: [record],
    })),
    retirementCandidates: retiredRecords.map((record) => ({
      resourceKey: record.retiredResourceKeys[0] ?? "",
      eventIds: [record.originalEventId ?? 0],
      supersededByEventId: record.supersededByEventId,
      reason: record.reason,
      retiredResults: [record],
    })),
    churn: {
      byClassification: {
        "read-context": 0,
        "search-context": 0,
        "command-output": 0,
        mutation: 0,
      },
      byTool: {},
      uniqueResourcesSeen: resources.length * 2,
    },
  };
}

beforeEach(() => {
  resetContextHygieneNoticeLedger();
});

describe("context-hygiene notice resource ledger identity", () => {
  it("announces a newly affected resource without repeating prior resources", () => {
    const resourceA = recordsForResource("a", 0);
    const resourceB = recordsForResource("b", 1);

    const first = collectPendingContextHygieneNotices(reportFor([resourceA]));
    expect(first).toHaveLength(2);
    markContextHygieneNoticesAnnounced(first);

    const second = collectPendingContextHygieneNotices(reportFor([resourceA, resourceB]));
    expect(second).toHaveLength(2);
    expect(new Set(second.map((entry) => entry.key)).size).toBe(2);
    expect(
      second.map((entry) =>
        entry.kind === "stale"
          ? entry.record.staleResourceKeys[0]
          : entry.record.retiredResourceKeys[0],
      ),
    ).toEqual(["file:src/b.ts", "command:test:workspace-b"]);

    markContextHygieneNoticesAnnounced(second);
    expect(collectPendingContextHygieneNotices(reportFor([resourceA, resourceB]))).toEqual([]);
  });
});

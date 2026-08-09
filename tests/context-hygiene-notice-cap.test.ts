import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeContextHygieneNotice,
  resetContextHygieneNoticeLedger,
} from "../src/context-hygiene-notices.js";
import {
  buildRetiredContextRecord,
  buildStaleContextRecord,
  type ContextHygieneReport,
  type ContextHygieneRetiredRecord,
  type ContextHygieneStaleRecord,
} from "../src/context-hygiene.js";

type NoticeRecord = ContextHygieneStaleRecord | ContextHygieneRetiredRecord;

function stale(tool: string, resultId: string, resourceKey: string, eventId: number): ContextHygieneStaleRecord {
  return buildStaleContextRecord({
    originalTool: tool,
    originalEventId: eventId,
    originalResultId: resultId,
    staleResourceKeys: [resourceKey],
    invalidatingMutationEventId: 100,
    invalidatingMutationResultId: "edit-cap",
    reason: "mutation-after-read",
  });
}

function retired(resultId: string, eventId: number): ContextHygieneRetiredRecord {
  return buildRetiredContextRecord({
    originalTool: "bash",
    originalEventId: eventId,
    originalResultId: resultId,
    retiredResourceKeys: ["command:test:npm test"],
    supersededByEventId: 200,
    supersededByResultId: "test-latest",
    reason: "same-command-success-rerun",
    command: "npm test",
  });
}

function reportFor(records: readonly NoticeRecord[]): ContextHygieneReport {
  const staleRecords = records.filter(
    (record): record is ContextHygieneStaleRecord => record.status === "stale",
  );
  const retiredRecords = records.filter(
    (record): record is ContextHygieneRetiredRecord => record.status === "retired",
  );
  const resourceKeys = records.flatMap((record) =>
    record.status === "stale" ? record.staleResourceKeys : record.retiredResourceKeys,
  );

  return {
    eventCount: records.length + 2,
    resourceCount: new Set(resourceKeys).size,
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
      uniqueResourcesSeen: new Set(resourceKeys).size,
    },
  };
}

beforeEach(() => {
  resetContextHygieneNoticeLedger();
});

describe("context-hygiene notice display cap", () => {
  it("caps semantic groups deterministically and consumes omitted records once", () => {
    const records: NoticeRecord[] = [
      stale("read", "read-a-1", "file:src/a.ts", 1),
      stale("read", "read-a-2", "file:src/a.ts", 2),
      stale("read", "read-a-3", "file:src/a.ts", 3),
      stale("grep", "grep-a", "file:src/a.ts", 4),
      stale("ast_search", "ast-a", "file:src/a.ts", 5),
      stale("read", "read-b", "file:src/b.ts", 6),
      stale("read", "read-c", "file:src/c.ts", 7),
      stale("read", "read-d", "file:src/d.ts", 8),
      stale("read", "read-e", "file:src/e.ts", 9),
      stale("read", "read-f", "file:src/f.ts", 10),
      stale("read", "read-g", "file:src/g.ts", 11),
      stale("read", "read-h", "file:src/h.ts", 12),
      stale("read", "read-i", "file:src/i.ts", 13),
      retired("test-old-1", 14),
      retired("test-old-2", 15),
      retired("test-old-3", 16),
    ];
    const report = reportFor(records);

    const first = consumeContextHygieneNotice(report)!;
    const detailLines = first
      .split("\n")
      .filter((line) => line.startsWith("- ") && line.includes(": ["));

    expect(detailLines).toHaveLength(8);
    expect(first).toContain("[Context hygiene] 16 earlier tool results no longer reflect current state.");
    expect(first).toContain("- ast_search (file:src/a.ts):");
    expect(first).toContain("- grep (file:src/a.ts):");
    expect(first).toContain("- read (file:src/a.ts):");
    expect(first).toContain("(3 results grouped)");
    expect(first).toContain("- read (file:src/b.ts):");
    expect(first).toContain("- Showing 8 of 12 notice groups; 4 groups omitted (6 results).");
    expect(consumeContextHygieneNotice(report)).toBeUndefined();

    resetContextHygieneNoticeLedger();
    const reversed = consumeContextHygieneNotice(reportFor([...records].reverse()));
    expect(reversed).toBe(first);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  collectPendingContextHygieneNotices,
  markContextHygieneNoticesAnnounced,
  resetContextHygieneNoticeLedger,
} from "../src/context-hygiene-notices.js";
import { buildBashCommandState } from "../src/bash-command-state.js";
import {
  buildCommandResource,
  buildContextHygieneMetadata,
  buildFileResource,
  createContextHygieneTracker,
} from "../src/context-hygiene.js";

beforeEach(() => {
  resetContextHygieneNoticeLedger();
});

describe("context hygiene notice ledger", () => {
  it("returns a stale record once and never again after it is marked announced", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/a.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-a" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-a" },
    );

    const first = collectPendingContextHygieneNotices(tracker.generateReport());
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "stale",
      record: { originalTool: "read", originalResultId: "read-a", reason: "mutation-after-read" },
    });

    markContextHygieneNoticesAnnounced(first);

    // generateReport() runs on every provider request and keeps reporting the
    // same stale candidate. It must not be announced twice.
    expect(collectPendingContextHygieneNotices(tracker.generateReport())).toEqual([]);
    expect(collectPendingContextHygieneNotices(tracker.generateReport())).toEqual([]);
  });

  it("produces no notices for an empty report", () => {
    const tracker = createContextHygieneTracker();
    expect(collectPendingContextHygieneNotices(tracker.generateReport())).toEqual([]);
  });

  it("orders stale notices before retired notices regardless of key ordering", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/a.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-a" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "edit", classification: "mutation", resources: [file] }),
      { resultId: "edit-a" },
    );

    // Two successful runs of the same retirement-eligible command produce a
    // retirement candidate (src/context-hygiene.ts:778-801).
    const lint = (resultId: string) =>
      tracker.record(
        buildContextHygieneMetadata({
          tool: "bash",
          classification: "command-output",
          resources: [buildCommandResource("npm run lint")],
          commandState: buildBashCommandState({ command: "npm run lint", text: "clean", isError: false }),
        }),
        { resultId },
      );
    lint("lint-1");
    lint("lint-2");

    const entries = collectPendingContextHygieneNotices(tracker.generateReport());

    // Naive lexicographic key sorting would put "retired:..." first.
    expect(entries.map((entry) => entry.kind)).toEqual(["stale", "retired"]);
    expect(entries.map((entry) => entry.record.originalResultId)).toEqual(["read-a", "lint-1"]);
  });

  it("re-announces after the ledger is reset", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("src/b.ts");
    tracker.record(
      buildContextHygieneMetadata({ tool: "read", classification: "read-context", resources: [file] }),
      { resultId: "read-b" },
    );
    tracker.record(
      buildContextHygieneMetadata({ tool: "write", classification: "mutation", resources: [file] }),
      { resultId: "write-b" },
    );

    markContextHygieneNoticesAnnounced(collectPendingContextHygieneNotices(tracker.generateReport()));
    expect(collectPendingContextHygieneNotices(tracker.generateReport())).toEqual([]);

    resetContextHygieneNoticeLedger();
    expect(collectPendingContextHygieneNotices(tracker.generateReport())).toHaveLength(1);
  });
});

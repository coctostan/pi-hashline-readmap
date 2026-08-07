import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeContextHygieneNotice,
  resetContextHygieneNoticeLedger,
} from "../src/context-hygiene-notices.js";
import {
  buildContextHygieneMetadata,
  buildFileResource,
  createContextHygieneTracker,
} from "../src/context-hygiene.js";

beforeEach(() => {
  resetContextHygieneNoticeLedger();
});

describe("consumeContextHygieneNotice", () => {
  it("returns undefined when there is nothing to announce", () => {
    const tracker = createContextHygieneTracker();
    expect(consumeContextHygieneNotice(tracker.generateReport())).toBeUndefined();
  });

  it("returns the rendered notice once and undefined on every later call", () => {
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

    const first = consumeContextHygieneNotice(tracker.generateReport());
    expect(first).toContain("[Context hygiene] 1 earlier tool result no longer reflects current state.");
    expect(first).toContain("- read (file:src/a.ts): [Stale read result —");

    expect(consumeContextHygieneNotice(tracker.generateReport())).toBeUndefined();
    expect(consumeContextHygieneNotice(tracker.generateReport())).toBeUndefined();
  });
});

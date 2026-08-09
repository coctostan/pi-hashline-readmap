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

describe("issue 243: context-hygiene notice amplification", () => {
  it("aggregates many stale reads of one file into one visible read detail", () => {
    const tracker = createContextHygieneTracker();
    const file = buildFileResource("tests/fixtures/shared.ts");

    for (let index = 1; index <= 21; index += 1) {
      tracker.record(
        buildContextHygieneMetadata({
          tool: "read",
          classification: "read-context",
          resources: [file],
        }),
        { resultId: `read-${index}` },
      );
    }

    tracker.record(
      buildContextHygieneMetadata({
        tool: "edit",
        classification: "mutation",
        resources: [file],
      }),
      { resultId: "edit-1" },
    );

    const report = tracker.generateReport();
    const notice = consumeContextHygieneNotice(report);
    const readDetails = notice
      ?.split("\n")
      .filter((line) => line.startsWith("- read (file:tests/fixtures/shared.ts):"));

    expect(report.staleCandidates[0]?.staleResults).toHaveLength(21);
    expect(notice).toContain("[Context hygiene] 21 earlier tool results no longer reflect current state.");
    expect(readDetails).toHaveLength(1);
    expect(readDetails?.[0]).toContain("(21 results grouped)");
  });
});

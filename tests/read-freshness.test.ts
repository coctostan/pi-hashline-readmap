import { describe, expect, it } from "vitest";
import { createReadFreshness } from "../src/read-freshness.js";

const candidate = (resourceKey: string, mutationEventId: number) => ({
  resourceKey,
  mutationEventId,
  staleEventIds: [],
  reason: "mutation-after-read" as const,
  staleResults: [],
});

describe("read freshness", () => {
  it("anchors a note at the next event id and expires it on a mutation with that same id", () => {
    let eventCount = 4;
    const freshness = createReadFreshness(() => eventCount);
    freshness.note("/repo/a.ts"); // anticipated id 5
    eventCount = 5;

    freshness.expireFromReport({ staleCandidates: [candidate("file:/repo/a.ts", 4)] });
    expect(freshness.has("/repo/a.ts")).toBe(true);

    freshness.expireFromReport({ staleCandidates: [candidate("file:/repo/a.ts", 5)] });
    expect(freshness.has("/repo/a.ts")).toBe(false);
  });

  it("keeps an own write's note through its own mutation id and expires it on a later one", () => {
    let eventCount = 4;
    const freshness = createReadFreshness(() => eventCount);
    freshness.note("/repo/a.ts", { own: true }); // anticipated id 5, the write's own mutation
    eventCount = 5;

    freshness.expireFromReport({ staleCandidates: [candidate("file:/repo/a.ts", 5)] });
    expect(freshness.has("/repo/a.ts")).toBe(true);

    freshness.expireFromReport({ staleCandidates: [candidate("file:/repo/a.ts", 6)] });
    expect(freshness.has("/repo/a.ts")).toBe(false);
  });

  it("ignores non-file candidates and files it never noted", () => {
    const freshness = createReadFreshness(() => 0);
    freshness.note("/repo/a.ts");
    freshness.expireFromReport({
      staleCandidates: [candidate("command:/repo/a.ts", 9), candidate("file:/repo/b.ts", 9)],
    });
    expect(freshness.has("/repo/a.ts")).toBe(true);
    expect(freshness.has("/repo/b.ts")).toBe(false);
  });

  it("keys paths the way context hygiene normalizes them", () => {
    const freshness = createReadFreshness(() => 0);
    freshness.note("C:\\repo\\a.ts");
    expect(freshness.has("C:/repo/a.ts")).toBe(true);
    freshness.expireFromReport({ staleCandidates: [candidate("file:C:/repo/a.ts", 1)] });
    expect(freshness.has("C:\\repo\\a.ts")).toBe(false);
  });
});

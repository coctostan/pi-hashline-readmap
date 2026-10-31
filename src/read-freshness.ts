import { normalizePathForContextHygiene, type ContextHygieneReport } from "./context-hygiene.js";

export interface ReadFreshness {
  note(absolutePath: string): void;
  has(absolutePath: string): boolean;
  expireFromReport(report: Pick<ContextHygieneReport, "staleCandidates">): void;
}

// Tracks which files carry live anchors the model may still edit with. Each entry maps a
// normalized absolute path to the tracker event id of its most recent live-anchor result
// (read / grep / ast_search / write / edit). When a later same-file mutation makes that
// result stale, the entry expires and edit's read-before-edit guard forces a re-read.
export function createReadFreshness(currentEventCount: () => number): ReadFreshness {
  const readTurns = new Map<string, number>();
  const key = (absolutePath: string) => normalizePathForContextHygiene(absolutePath);
  return {
    note(absolutePath) {
      // note runs synchronously inside the tool, before tool_result records its event, so that
      // event will get id eventCount + 1. Anchoring there keeps the entry strictly newer than
      // every mutation id <= the current eventCount, which is what expireFromReport compares.
      readTurns.set(key(absolutePath), currentEventCount() + 1);
    },
    has(absolutePath) {
      return readTurns.has(key(absolutePath));
    },
    expireFromReport(report) {
      if (readTurns.size === 0) return;
      for (const candidate of report.staleCandidates) {
        if (!candidate.resourceKey.startsWith("file:")) continue;
        const absolutePath = key(candidate.resourceKey.slice("file:".length));
        const recordedEventId = readTurns.get(absolutePath);
        if (recordedEventId === undefined) continue;
        if (recordedEventId <= candidate.mutationEventId) {
          readTurns.delete(absolutePath);
        }
      }
    },
  };
}

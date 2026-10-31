import { normalizePathForContextHygiene, type ContextHygieneReport } from "./context-hygiene.js";

export interface ReadFreshness {
  /** `own` marks this extension's own successful write: ServedLines remaps its shifts. */
  note(absolutePath: string, mark?: { own: boolean }): void;
  has(absolutePath: string): boolean;
  expireFromReport(report: Pick<ContextHygieneReport, "staleCandidates">): void;
  /** A change this extension did not make: the file has no live view left, own or not. */
  expirePath(absolutePath: string): void;
}

// Tracks which files carry live anchors the model may still edit with. Each entry maps a
// normalized absolute path to the tracker event id of its most recent live-anchor result
// (read / grep / ast_search / write / edit). When a later same-file mutation makes that
// result stale, the entry expires and edit's read-before-edit guard forces a re-read.
export function createReadFreshness(currentEventCount: () => number): ReadFreshness {
  const readTurns = new Map<string, { id: number; own: boolean }>();
  const key = (absolutePath: string) => normalizePathForContextHygiene(absolutePath);
  return {
    note(absolutePath, mark) {
      // note runs synchronously inside the tool, before tool_result records its event, so that
      // event will get id eventCount + 1. Anchoring there keeps the entry strictly newer than
      // every mutation id <= the current eventCount, which is what expireFromReport compares.
      readTurns.set(key(absolutePath), { id: currentEventCount() + 1, own: mark?.own === true });
    },
    has(absolutePath) {
      return readTurns.has(key(absolutePath));
    },
    expireFromReport(report) {
      if (readTurns.size === 0) return;
      for (const candidate of report.staleCandidates) {
        if (!candidate.resourceKey.startsWith("file:")) continue;
        const absolutePath = key(candidate.resourceKey.slice("file:".length));
        const recorded = readTurns.get(absolutePath);
        if (recorded === undefined) continue;
        // An own write anticipated its own mutation event: that mutation is the view itself.
        if (recorded.id < candidate.mutationEventId || (recorded.id === candidate.mutationEventId && !recorded.own)) {
          readTurns.delete(absolutePath);
        }
      }
    },
    expirePath(absolutePath) {
      readTurns.delete(key(absolutePath));
    },
  };
}

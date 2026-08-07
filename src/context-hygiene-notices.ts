/**
 * Forward-only context-hygiene notices.
 *
 * Stale/retired signalling must never rewrite already-transmitted provider
 * input (issue #225): historical bytes are part of the prompt-cache prefix.
 * Instead each record is announced exactly once, prefixed onto the *current*
 * tool result — a brand-new message with zero prefix cost. This mirrors the
 * existing doom-loop warning pattern in index.ts.
 *
 * The ledger is monotonic on purpose. The event tracker is a bounded ring
 * buffer (src/context-hygiene.ts:636); without a durable ledger an evicted
 * record could be re-derived and re-announced.
 */
import {
  renderRetiredContextPlaceholder,
  renderStaleContextPlaceholder,
  type ContextHygieneReport,
  type ContextHygieneRetiredRecord,
  type ContextHygieneStaleRecord,
} from "./context-hygiene.js";

export type ContextHygieneNoticeEntry =
  | { kind: "stale"; key: string; record: ContextHygieneStaleRecord }
  | { kind: "retired"; key: string; record: ContextHygieneRetiredRecord };

// Staleness is the more urgent signal and must lead. Sorting on the raw key
// alone would put "retired:…" before "stale:…" lexicographically.
const NOTICE_KIND_ORDER: Record<ContextHygieneNoticeEntry["kind"], number> = { stale: 0, retired: 1 };

function recordIdentity(originalResultId: string | undefined, originalEventId: number | undefined): string {
  return originalResultId ?? `event-${originalEventId ?? 0}`;
}

export function staleNoticeKey(record: ContextHygieneStaleRecord): string {
  return `stale:${recordIdentity(record.originalResultId, record.originalEventId)}:${record.reason}`;
}

export function retiredNoticeKey(record: ContextHygieneRetiredRecord): string {
  return `retired:${recordIdentity(record.originalResultId, record.originalEventId)}:${record.reason}`;
}

let announced = new Set<string>();

export function resetContextHygieneNoticeLedger(): void {
  announced = new Set<string>();
}

export function collectPendingContextHygieneNotices(
  report: ContextHygieneReport,
): ContextHygieneNoticeEntry[] {
  const entries: ContextHygieneNoticeEntry[] = [];
  const seen = new Set<string>();

  for (const candidate of report.staleCandidates) {
    for (const record of candidate.staleResults ?? []) {
      const key = staleNoticeKey(record);
      if (announced.has(key) || seen.has(key)) continue;
      seen.add(key);
      entries.push({ kind: "stale", key, record });
    }
  }

  for (const candidate of report.retirementCandidates) {
    for (const record of candidate.retiredResults ?? []) {
      const key = retiredNoticeKey(record);
      if (announced.has(key) || seen.has(key)) continue;
      seen.add(key);
      entries.push({ kind: "retired", key, record });
    }
  }

  entries.sort((left, right) => {
    if (NOTICE_KIND_ORDER[left.kind] !== NOTICE_KIND_ORDER[right.kind]) {
      return NOTICE_KIND_ORDER[left.kind] - NOTICE_KIND_ORDER[right.kind];
    }
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  });
  return entries;
}

export function markContextHygieneNoticesAnnounced(
  entries: readonly ContextHygieneNoticeEntry[],
): void {
  for (const entry of entries) announced.add(entry.key);
}

function noticeResourceLabel(keys: readonly string[]): string {
  return keys.length === 0 ? "" : ` (${keys.join(", ")})`;
}

function renderNoticeLine(entry: ContextHygieneNoticeEntry): string {
  if (entry.kind === "stale") {
    return `- ${entry.record.originalTool}${noticeResourceLabel(entry.record.staleResourceKeys)}: ${renderStaleContextPlaceholder(entry.record)}`;
  }
  return `- ${entry.record.originalTool}${noticeResourceLabel(entry.record.retiredResourceKeys)}: ${renderRetiredContextPlaceholder(entry.record)}`;
}

export function renderContextHygieneNotice(entries: readonly ContextHygieneNoticeEntry[]): string {
  if (entries.length === 0) return "";
  const count = entries.length;
  const header =
    count === 1
      ? "[Context hygiene] 1 earlier tool result no longer reflects current state. Do not treat it as current:"
      : `[Context hygiene] ${count} earlier tool results no longer reflect current state. Do not treat them as current:`;
  return [header, ...entries.map(renderNoticeLine)].join("\n");
}

/**
 * Collect, announce, and render pending notices in one atomic step.
 * Returns `undefined` when there is nothing new to announce so callers can
 * skip rewriting the outgoing tool result entirely.
 */
export function consumeContextHygieneNotice(report: ContextHygieneReport): string | undefined {
  const entries = collectPendingContextHygieneNotices(report);
  if (entries.length === 0) return undefined;
  markContextHygieneNoticesAnnounced(entries);
  return renderContextHygieneNotice(entries);
}

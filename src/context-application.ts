import {
  renderRetiredContextPlaceholder,
  renderStaleContextPlaceholder,
  type ContextHygieneReport,
  type ContextHygieneRetiredRecord,
  type ContextHygieneStaleResultsMode,
  type ContextHygieneStaleRecord,
} from "./context-hygiene.js";

type ContextToolResultMessage = {
  role?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  content?: unknown;
  details?: unknown;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isMaskableStaleTool(tool: string): boolean {
  return tool === "read" || tool === "grep" || tool === "ast_search" || tool === "bash";
}

function isMaskableRetiredTool(tool: string): boolean {
  return tool === "bash";
}

function staleRecordsByResultId(report: ContextHygieneReport): Map<string, ContextHygieneStaleRecord> {
  const records = new Map<string, ContextHygieneStaleRecord>();
  for (const candidate of report.staleCandidates) {
    for (const record of candidate.staleResults) {
      if (!record.originalResultId || !isMaskableStaleTool(record.originalTool)) continue;
      const existing = records.get(record.originalResultId);
      if (!existing || existing.invalidatingMutationEventId < record.invalidatingMutationEventId) {
        records.set(record.originalResultId, record);
      }
    }
  }
  return records;
}

function retiredRecordsByResultId(report: ContextHygieneReport): Map<string, ContextHygieneRetiredRecord> {
  const records = new Map<string, ContextHygieneRetiredRecord>();
  for (const candidate of report.retirementCandidates) {
    for (const record of candidate.retiredResults ?? []) {
      if (!record.originalResultId || record.originalTool !== "bash") continue;
      const existing = records.get(record.originalResultId);
      if (!existing || existing.supersededByEventId < record.supersededByEventId) {
        records.set(record.originalResultId, record);
      }
    }
  }
  return records;
}

function maskStaleToolResultMessage<T extends ContextToolResultMessage>(message: T, record: ContextHygieneStaleRecord): T {
  const details = isRecord(message.details) ? message.details : {};
  return {
    ...message,
    content: [{ type: "text" as const, text: renderStaleContextPlaceholder(record) }],
    details: {
      ...details,
      contextHygieneStale: record,
    },
  };
}

function maskRetiredToolResultMessage<T extends ContextToolResultMessage>(message: T, record: ContextHygieneRetiredRecord): T {
  const details = isRecord(message.details) ? message.details : {};
  return {
    ...message,
    content: [{ type: "text" as const, text: renderRetiredContextPlaceholder(record) }],
    details: {
      ...details,
      contextHygieneRetired: record,
    },
  };
}

function appendOnlyStaleRecordsByMutationId(
  report: ContextHygieneReport,
): Map<string, ContextHygieneStaleRecord[]> {
  const firstInvalidationByResultId = new Map<string, ContextHygieneStaleRecord>();
  for (const candidate of report.staleCandidates) {
    for (const record of candidate.staleResults) {
      if (!record.originalResultId || !isMaskableStaleTool(record.originalTool)) continue;
      const existing = firstInvalidationByResultId.get(record.originalResultId);
      if (!existing || record.invalidatingMutationEventId < existing.invalidatingMutationEventId) {
        firstInvalidationByResultId.set(record.originalResultId, record);
      }
    }
  }

  const recordsByMutationId = new Map<string, ContextHygieneStaleRecord[]>();
  for (const record of firstInvalidationByResultId.values()) {
    if (!record.invalidatingMutationResultId) continue;
    const records = recordsByMutationId.get(record.invalidatingMutationResultId) ?? [];
    records.push(record);
    recordsByMutationId.set(record.invalidatingMutationResultId, records);
  }
  return recordsByMutationId;
}

function appendOnlyRetiredRecordsBySupersedingId(
  report: ContextHygieneReport,
): Map<string, ContextHygieneRetiredRecord[]> {
  const firstRetirementByResultId = new Map<string, ContextHygieneRetiredRecord>();
  for (const candidate of report.retirementCandidates) {
    for (const record of candidate.retiredResults ?? []) {
      if (!record.originalResultId || !isMaskableRetiredTool(record.originalTool)) continue;
      const existing = firstRetirementByResultId.get(record.originalResultId);
      if (!existing || record.supersededByEventId < existing.supersededByEventId) {
        firstRetirementByResultId.set(record.originalResultId, record);
      }
    }
  }

  const recordsBySupersedingId = new Map<string, ContextHygieneRetiredRecord[]>();
  for (const record of firstRetirementByResultId.values()) {
    if (!record.supersededByResultId) continue;
    const records = recordsBySupersedingId.get(record.supersededByResultId) ?? [];
    records.push(record);
    recordsBySupersedingId.set(record.supersededByResultId, records);
  }
  return recordsBySupersedingId;
}

function frozenNoticesByTargetId<T extends ContextToolResultMessage>(
  messages: readonly T[],
): Map<string, string[]> {
  const resultIds = new Set(
    messages
      .filter((message) => message.role === "toolResult" && typeof message.toolCallId === "string")
      .map((message) => message.toolCallId as string),
  );
  const noticesByTargetId = new Map<string, string[]>();

  for (const target of messages) {
    if (target.role !== "toolResult" || typeof target.toolCallId !== "string") continue;
    if (!isRecord(target.details) || !isRecord(target.details.contextHygiene)) continue;
    const appliedEffects = target.details.contextHygiene.appliedEffects;
    if (!isRecord(appliedEffects) || !Array.isArray(appliedEffects.notices)) continue;

    const notices = noticesByTargetId.get(target.toolCallId) ?? [];
    for (const notice of appliedEffects.notices) {
      if (!isRecord(notice) || typeof notice.resultId !== "string" || typeof notice.text !== "string") continue;
      if (resultIds.has(notice.resultId)) notices.push(notice.text);
    }
    if (notices.length > 0) noticesByTargetId.set(target.toolCallId, notices);
  }

  return noticesByTargetId;
}

function appendContextNotices<T extends ContextToolResultMessage>(
  message: T,
  notices: readonly string[],
): T {
  if (!Array.isArray(message.content)) return message;
  const uniqueNotices = [...new Set(notices)];
  const existingNotices = new Set(
    message.content
      .filter((item): item is { type: "text"; text: string } =>
        isRecord(item) && item.type === "text" && typeof item.text === "string")
      .map((item) => item.text),
  );
  const additions = uniqueNotices
    .filter((notice) => !existingNotices.has(notice))
    .map((text) => ({ type: "text" as const, text }));
  return additions.length > 0 ? { ...message, content: [...message.content, ...additions] } : message;
}

function applyAppendOnlyStaleContext<T extends ContextToolResultMessage>(
  messages: readonly T[],
  report: ContextHygieneReport,
): T[] {
  const staleRecordsByMutationId = appendOnlyStaleRecordsByMutationId(report);
  const retiredRecordsBySupersedingId = appendOnlyRetiredRecordsBySupersedingId(report);
  const frozenNotices = frozenNoticesByTargetId(messages);
  if (
    staleRecordsByMutationId.size === 0
    && retiredRecordsBySupersedingId.size === 0
    && frozenNotices.size === 0
  ) {
    return messages as T[];
  }

  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.role !== "toolResult" || typeof message.toolCallId !== "string") return message;
    const staleRecords = staleRecordsByMutationId.get(message.toolCallId) ?? [];
    const retiredRecords = retiredRecordsBySupersedingId.get(message.toolCallId) ?? [];
    const persistedNotices = frozenNotices.get(message.toolCallId) ?? [];
    if (staleRecords.length === 0 && retiredRecords.length === 0 && persistedNotices.length === 0) return message;
    const nextMessage = appendContextNotices(message, [
      ...staleRecords.map(renderStaleContextPlaceholder),
      ...retiredRecords.map(renderRetiredContextPlaceholder),
      ...persistedNotices,
    ]);
    if (nextMessage !== message) changed = true;
    return nextMessage;
  });
  return changed ? nextMessages : (messages as T[]);
}

export function applyContextHygieneStaleContext<T extends ContextToolResultMessage>(
  messages: readonly T[],
  report: ContextHygieneReport,
  mode: ContextHygieneStaleResultsMode = "replace",
): T[] {
  if (mode === "disabled") return messages as T[];
  if (mode === "append-only") return applyAppendOnlyStaleContext(messages, report);

  const staleByResultId = staleRecordsByResultId(report);
  const retiredByResultId = retiredRecordsByResultId(report);
  if (staleByResultId.size === 0 && retiredByResultId.size === 0) return messages as T[];

  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.role !== "toolResult" || typeof message.toolCallId !== "string") return message;
    const staleRecord = staleByResultId.get(message.toolCallId);
    if (staleRecord) {
      if (message.toolName !== staleRecord.originalTool) return message;
      changed = true;
      return maskStaleToolResultMessage(message, staleRecord);
    }
    const retiredRecord = retiredByResultId.get(message.toolCallId);
    if (retiredRecord) {
      if (message.toolName !== retiredRecord.originalTool) return message;
      changed = true;
      return maskRetiredToolResultMessage(message, retiredRecord);
    }
    return message;
  });

  return changed ? nextMessages : (messages as T[]);
}

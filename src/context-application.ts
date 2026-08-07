import type {
  ContextHygieneReport,
  ContextHygieneRetiredRecord,
  ContextHygieneStaleRecord,
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

export function annotateStaleToolResultMessage<T extends ContextToolResultMessage>(
  message: T,
  record: ContextHygieneStaleRecord,
): T {
  const details = isRecord(message.details) ? message.details : {};
  return {
    ...message,
    details: {
      ...details,
      contextHygieneStale: record,
    },
  };
}

export function annotateRetiredToolResultMessage<T extends ContextToolResultMessage>(
  message: T,
  record: ContextHygieneRetiredRecord,
): T {
  const details = isRecord(message.details) ? message.details : {};
  return {
    ...message,
    details: {
      ...details,
      contextHygieneRetired: record,
    },
  };
}

export function applyContextHygieneStaleContext<T extends ContextToolResultMessage>(
  messages: readonly T[],
  report: ContextHygieneReport,
): T[] {
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
      return annotateStaleToolResultMessage(message, staleRecord);
    }
    const retiredRecord = retiredByResultId.get(message.toolCallId);
    if (retiredRecord) {
      if (message.toolName !== retiredRecord.originalTool) return message;
      changed = true;
      return annotateRetiredToolResultMessage(message, retiredRecord);
    }
    return message;
  });

  return changed ? nextMessages : (messages as T[]);
}

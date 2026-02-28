import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

interface JsonlSample {
  lineNumber: number;
  preview: string;
  keys: string[];
}

/**
 * Extract schema info from a JSON line.
 */
function analyzeJsonLine(
  line: string
): { keys: string[]; type: string } | null {
  try {
    const parsed = JSON.parse(line);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return { keys: Object.keys(parsed), type: "object" };
    }
    if (Array.isArray(parsed)) {
      return { keys: [], type: `array[${parsed.length}]` };
    }
    return { keys: [], type: typeof parsed };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pi session detection and parsing
// ---------------------------------------------------------------------------

interface PiSessionHeader {
  type: "session";
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

/**
 * Check if the first line of a JSONL file is a pi session header.
 */
function parsePiSessionHeader(line: string): PiSessionHeader | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (
      parsed["type"] === "session" &&
      typeof parsed["version"] === "number" &&
      typeof parsed["id"] === "string" &&
      typeof parsed["timestamp"] === "string" &&
      typeof parsed["cwd"] === "string"
    ) {
      return parsed as unknown as PiSessionHeader;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/** Accumulated entry type counts for a pi session. */
interface SessionCounts {
  user: number;
  assistant: number;
  toolResult: number;
  compaction: number;
  branchSummary: number;
  modelChange: number;
  sessionInfo: number;
  other: number;
}

/** A structural symbol collected while streaming session entries. */
interface SessionSymbolRecord {
  symbol: FileSymbol;
  /** Line where this symbol's "span" starts (used to compute endLine). */
  spanStart: number;
}

/**
 * Extract a short text preview from a user message content field.
 * Handles both string and content-block-array formats.
 */
function extractUserPreview(content: unknown, maxLength = 80): string {
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (
        typeof block === "object" &&
        block !== null &&
        (block as Record<string, unknown>)["type"] === "text" &&
        typeof (block as Record<string, unknown>)["text"] === "string"
      ) {
        text = (block as Record<string, unknown>)["text"] as string;
        break;
      }
    }
  }
  const cleaned = text.replaceAll(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 3)}...`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Format the session timestamp for display.
 * Returns "YYYY-MM-DD HH:MM UTC" or the raw string on parse failure.
 */
function formatSessionTimestamp(ts: string): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) {
    return ts;
  }
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Build a stats summary string from entry type counts.
 */
function formatStatsSummary(counts: SessionCounts): string {
  const parts: string[] = [];
  if (counts.user > 0) {
    parts.push(`${counts.user} user`);
  }
  if (counts.assistant > 0) {
    parts.push(`${counts.assistant} assistant`);
  }
  if (counts.toolResult > 0) {
    parts.push(`${counts.toolResult} tool results`);
  }
  if (counts.compaction > 0) {
    parts.push(`${counts.compaction} compaction`);
  }
  if (counts.branchSummary > 0) {
    parts.push(`${counts.branchSummary} branch summary`);
  }
  if (counts.modelChange > 0) {
    parts.push(`${counts.modelChange} model change`);
  }
  return `Stats: ${parts.join(", ")}`;
}

/**
 * Count an entry by its type, incrementing the appropriate counter.
 */
function countEntryType(
  counts: SessionCounts,
  entry: Record<string, unknown>,
  entryType: string | undefined
): void {
  if (entryType === "message") {
    const msg = entry["message"] as Record<string, unknown> | undefined;
    const role = msg?.["role"] as string | undefined;
    if (role === "user") {
      counts.user++;
    } else if (role === "assistant") {
      counts.assistant++;
    } else if (role === "toolResult") {
      counts.toolResult++;
    }
  } else if (entryType === "compaction") {
    counts.compaction++;
  } else if (entryType === "branch_summary") {
    counts.branchSummary++;
  } else if (entryType === "model_change") {
    counts.modelChange++;
  } else if (entryType === "session_info") {
    counts.sessionInfo++;
  } else {
    counts.other++;
  }
}

/**
 * Parse a pi session JSONL file into a conversation-aware structural map.
 *
 * Streams line-by-line, producing symbols for:
 * - Session header (Module)
 * - Stats summary (Property)
 * - User message turns (Function) — line range spans through responses
 * - Compaction boundaries (Namespace)
 * - Model changes (Namespace)
 * - Session name (Property)
 */
async function parsePiSession(
  filePath: string,
  header: PiSessionHeader,
  totalBytes: number,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const counts: SessionCounts = {
    user: 0,
    assistant: 0,
    toolResult: 0,
    compaction: 0,
    branchSummary: 0,
    modelChange: 0,
    sessionInfo: 0,
    other: 0,
  };

  // Collect structural symbols while streaming.
  // We track "open" user turns to compute their endLine once the next
  // structural entry appears.
  const records: SessionSymbolRecord[] = [];
  let lineCount = 0;
  let openUserTurn: SessionSymbolRecord | null = null;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream });

  signal?.addEventListener("abort", () => {
    rl.close();
    stream.destroy();
  });

  for await (const line of rl) {
    lineCount++;

    // Skip the header (line 1), already parsed
    if (lineCount === 1) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const entryType = entry["type"] as string | undefined;

    countEntryType(counts, entry, entryType);

    // Collect structural symbols
    if (entryType === "message") {
      const msg = entry["message"] as Record<string, unknown> | undefined;
      const role = msg?.["role"] as string | undefined;

      if (role === "user") {
        // Close previous user turn
        if (openUserTurn) {
          openUserTurn.symbol.endLine = lineCount - 1;
        }

        const preview = extractUserPreview(msg?.["content"]);
        const record: SessionSymbolRecord = {
          symbol: {
            name: `[User] ${preview}`,
            kind: SymbolKind.Function,
            startLine: lineCount,
            endLine: lineCount, // updated when next structural entry appears
          },
          spanStart: lineCount,
        };
        records.push(record);
        openUserTurn = record;
      }
      // assistant and toolResult messages fold into the current user turn.
      // Future: showing tool calls as nested child symbols under
      // user turns would provide richer navigation (currently folded for simplicity).
    } else if (entryType === "compaction") {
      // Close previous user turn
      if (openUserTurn) {
        openUserTurn.symbol.endLine = lineCount - 1;
        openUserTurn = null;
      }

      records.push({
        symbol: {
          name: "[Compaction]",
          kind: SymbolKind.Namespace,
          startLine: lineCount,
          endLine: lineCount,
        },
        spanStart: lineCount,
      });
    } else if (entryType === "model_change") {
      const provider = entry["provider"] as string | undefined;
      const modelId = entry["modelId"] as string | undefined;
      const label =
        provider && modelId
          ? `${provider}/${modelId}`
          : (provider ?? modelId ?? "unknown");

      records.push({
        symbol: {
          name: `[Model] ${label}`,
          kind: SymbolKind.Namespace,
          startLine: lineCount,
          endLine: lineCount,
        },
        spanStart: lineCount,
      });
    } else if (entryType === "session_info") {
      const name = entry["name"] as string | undefined;
      if (name) {
        records.push({
          symbol: {
            name: `[Session] ${name}`,
            kind: SymbolKind.Property,
            startLine: lineCount,
            endLine: lineCount,
          },
          spanStart: lineCount,
        });
      }
    } else if (entryType === "branch_summary") {
      // Close previous user turn
      if (openUserTurn) {
        openUserTurn.symbol.endLine = lineCount - 1;
        openUserTurn = null;
      }

      records.push({
        symbol: {
          name: "[Branch Summary]",
          kind: SymbolKind.Namespace,
          startLine: lineCount,
          endLine: lineCount,
        },
        spanStart: lineCount,
      });
    }
  }

  // Close final open user turn
  if (openUserTurn) {
    openUserTurn.symbol.endLine = lineCount;
  }

  // Assemble symbols in line order
  const symbols: FileSymbol[] = [
    // Header symbol
    {
      name: `Pi Session: ${header.cwd} (${formatSessionTimestamp(header.timestamp)})`,
      kind: SymbolKind.Module,
      startLine: 1,
      endLine: 1,
    },
    // Stats summary
    {
      name: formatStatsSummary(counts),
      kind: SymbolKind.Property,
      startLine: 1,
      endLine: lineCount,
    },
    // Conversation symbols (already in line order from streaming)
    ...records.map((r) => r.symbol),
  ];

  return {
    path: filePath,
    totalLines: lineCount,
    totalBytes,
    language: "Pi Session",
    symbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  };
}

// ---------------------------------------------------------------------------
// Generic JSONL parsing (original logic)
// ---------------------------------------------------------------------------

/**
 * Generate a generic file map for a JSON Lines file.
 */
async function parseGenericJsonl(
  filePath: string,
  totalBytes: number,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const samples: JsonlSample[] = [];
  let lineCount = 0;
  let schema: { keys: string[]; type: string } | null = null;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream });

  signal?.addEventListener("abort", () => {
    rl.close();
    stream.destroy();
  });

  for await (const line of rl) {
    lineCount++;

    // Collect first few samples (only from first 100 lines)
    if (lineCount <= 100 && samples.length < 10 && line.trim()) {
      const lineSchema = analyzeJsonLine(line);
      if (lineSchema) {
        samples.push({
          lineNumber: lineCount,
          preview: line.slice(0, 80) + (line.length > 80 ? "..." : ""),
          keys: lineSchema.keys,
        });

        if (!schema) {
          schema = lineSchema;
        }
      }
    }
  }

  const symbols: FileSymbol[] = [];

  if (schema) {
    symbols.push({
      name: `Schema: ${schema.type}${schema.keys.length > 0 ? ` {${schema.keys.slice(0, 5).join(", ")}${schema.keys.length > 5 ? "..." : ""}}` : ""}`,
      kind: SymbolKind.Class,
      startLine: 1,
      endLine: 1,
    });
  }

  for (const sample of samples.slice(0, 5)) {
    symbols.push({
      name: `Line ${sample.lineNumber}: ${sample.preview}`,
      kind: SymbolKind.Variable,
      startLine: sample.lineNumber,
      endLine: sample.lineNumber,
    });
  }

  if (lineCount > samples.length) {
    symbols.push({
      name: `... ${lineCount - samples.length} more lines`,
      kind: SymbolKind.Variable,
      startLine: samples.length + 1,
      endLine: lineCount,
    });
  }

  return {
    path: filePath,
    totalLines: lineCount,
    totalBytes,
    language: "JSON Lines",
    symbols,
    imports: [],
    detailLevel: DetailLevel.Full,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Generate a file map for a JSON Lines file.
 *
 * If the first line is a pi session header (`{"type":"session",...}`),
 * produces a conversation-aware structural map. Otherwise falls back to
 * generic schema + sample display.
 */
export async function jsonlMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Read just the first line to detect pi sessions
    const firstLine = await readFirstLine(filePath, signal);
    if (firstLine !== null) {
      const sessionHeader = parsePiSessionHeader(firstLine);
      if (sessionHeader) {
        return parsePiSession(filePath, sessionHeader, totalBytes, signal);
      }
    }

    return parseGenericJsonl(filePath, totalBytes, signal);
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`JSONL mapper failed: ${error}`);
    return null;
  }
}

/**
 * Read the first non-empty line from a file.
 */
async function readFirstLine(
  filePath: string,
  signal?: AbortSignal
): Promise<string | null> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream });

  signal?.addEventListener("abort", () => {
    rl.close();
    stream.destroy();
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return null;
  } finally {
    rl.close();
    stream.destroy();
  }
}

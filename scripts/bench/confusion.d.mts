export interface ScoredCall {
  id: string;
  tool: string;
  /** UTF-8 bytes of the result's text blocks; null when the stream holds no result. */
  resultBytes: number | null;
  error: boolean;
  /** Refused by Pi before the tool ran: invalid arguments or an unknown tool. */
  rejected: boolean;
  redundant: boolean;
  /** The bash hint naming an active tool that covers this command's pipeline heads, else null. */
  wrongTool: string | null;
  toolSetKnown: boolean;
}
export interface ScoredTask { editId: string; callsBeforeTouch: number; touchedBy: string }
export interface ScoredSession { cwd: string | null; calls: ScoredCall[]; tasks: ScoredTask[] }
export interface Percentiles { p50: number; p90: number; p99: number }
export interface ToolSummary {
  name: string;
  calls: number;
  errors: number;
  rejected: number;
  redundant: number;
  wrongTool: number;
  bytes: (Percentiles & { total: number }) | null;
}
export interface CorpusSummary {
  sessions: number;
  calls: number;
  duplicates: number;
  unknownToolSet: number;
  tools: ToolSummary[];
  wrongTool: Record<string, number>;
  tasks: { count: number; callsBeforeTouch: Percentiles | null; touchedBy: Record<string, number> };
}
export function scoreSession(text: string): ScoredSession;
export function summarizeCorpus(scored: ScoredSession[]): CorpusSummary;

export interface RunPiOptions {
  cwd: string; prompt: string; model: string; thinking: string; extensions: string[]; timeoutMs: number;
  /** A Pi CLI script, run with this Node; the global `pi` when absent. */
  cli?: string;
  excludeTools?: string[];
  /** Added to this process's environment. */
  env?: Record<string, string>;
}
export interface RunPiResult { code: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number }
export interface EventSummary {
  toolCalls: Record<string, number>;
  toolErrors: number;
  turns: number;
  tokens: number;
  /** Input, cache-read and cache-write tokens of every assistant message. */
  inputTokens: number;
  cost: number;
  models: string[];
  errors: string[];
}
export function runPi(options: RunPiOptions): Promise<RunPiResult>;
export function summarizeEvents(stdout: string): EventSummary;
export function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void>;

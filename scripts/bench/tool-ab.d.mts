import type { EventSummary } from "./lib.mjs";
import type { LocateTask } from "./locate-tasks/tasks.mjs";

export interface Arm { name: string; extension: boolean; exclude: string[] }
export const ARMS: Arm[];

export interface AbTask {
  set: "locate" | "edit";
  id: string;
  prompt: string;
  prepare(dir: string): void;
  /** The task's failures for a workspace; empty means it passes. */
  verify(dir: string, timeoutMs: number): Promise<string[]>;
}
export function locateTask(task: LocateTask): AbTask;
/** A hash of a checkout's uncommitted changes to what an extension arm loads or scores with; null when none. */
export function treeChanges(repo: string): string | null;
/** The selected host, run from outside `repo`: one inside is replaced by its version installed under `cacheDir`. */
export function benchHost(
  selected: { host: string; version: string },
  repo: string,
  options?: { cacheDir?: string; install?: (version: string, prefix: string) => void },
): { host: string; version: string; cli: string };
/** The tree of everything in `repo` that git tracks or would add, outside `exclude`. */
export function checkoutTree(repo: string, exclude?: string[]): string;
/** A worker recording each result, failing and throwing on a run after which the checkout's tree changed. */
export function guardedWorker<J, R extends { cost: number; pass: boolean; failure: string | null }>(
  run: (job: J) => Promise<R>,
  record: (result: R) => void,
  checkout: { repo: string; exclude: string[] },
): (job: J) => Promise<R>;

export interface Job<T> { task: T; model: string; attempt: number; arm: Arm }
export function planJobs<T>(plan: { tasks: T[]; arms: Arm[]; models: string[]; repeat: number }): Job<T>[];

export function runJobs<T>(
  jobs: T[],
  options: { concurrency: number; maxCost: number; spent: number; maxRunCost: number | null },
  worker: (job: T) => Promise<{ cost: number }>,
): Promise<{ spent: number; skipped: number }>;

export interface Confusion { errors: number; rejected: number; redundant: number; wrongTool: number; callsBeforeTouch: number | null }
export interface RunScore extends EventSummary { confusion: Confusion }
export function scoreRun(stdout: string): RunScore;

export interface RunResult extends RunScore {
  set: "locate" | "edit";
  task: string;
  arm: string;
  model: string;
  attempt: number;
  pass: boolean;
  failure: string | null;
  diffs: string[];
  durationMs: number;
}
export interface Metric { mean: number | null; spread: number | null }
export interface SummaryRow {
  set: "locate" | "edit";
  model: string;
  arm: string;
  runs: number;
  repeats: number;
  passed: number;
  totalCost: number;
  metrics: Record<"pass" | "inputTokens" | "cost" | "toolCalls" | "errors" | "rejected" | "redundant" | "wrongTool" | "callsBeforeTouch", Metric>;
}
export function summarizeRuns(results: RunResult[]): SummaryRow[];
export function formatSummary(summary: {
  rows: SummaryRow[];
  results: RunResult[];
  /** startedAt: run.json's ISO timestamp; the summary prints its UTC day. */
  meta: { models: string[]; arms: string[]; repeat: number; hostVersion: string; spent: number; maxCost: number; skipped: number; startedAt: string };
}): string;

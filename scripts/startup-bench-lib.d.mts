export const WARM_REDUCTION_THRESHOLD: number;
export const COLD_OVERHEAD_LIMIT_SECONDS: number;
export const LAZY_SHARE_THRESHOLD: number;
export type StartupOutcome = "BUNDLE" | "LAZY" | "NO-GO";
export interface StartupGateInput { a: number; b: number; c: number; d: number; dCold: number }
export interface StartupGateResult {
  bundleReduction: number;
  coldOverhead: number;
  bundlePasses: boolean;
  lazyShareOfBundle: number;
  outcome: StartupOutcome;
}
export interface VariantRuns { warm: number[]; cold: number[] }
export interface StartupRuns { a: VariantRuns; b: VariantRuns; c: VariantRuns; d: VariantRuns }
export function median(values: number[]): number;
export function evaluateStartupGate(input: StartupGateInput): StartupGateResult;
export function gateFromRuns(runs: StartupRuns): StartupGateResult;
export function extractOutcome(markdown: string): StartupOutcome | null;
export function extractMeasurements(markdown: string): any | null;
export interface RunPlanEntry {
  variant: "a" | "b" | "c" | "d";
  mode: "warm" | "cold";
  command: string;
  args: string[];
  env: Record<string, string>;
  repeat: number;
  discardFirst: boolean;
}
export function buildRunPlan(options: { repo: string; lazyDir?: string; bundleDir?: string; runs?: number; pi?: string }): RunPlanEntry[];
export interface ResultRow { variant: string; mode: "warm" | "cold"; medianSeconds: number; overheadSeconds: number }
export function summarizeResults(runs: Record<string, VariantRuns>): ResultRow[];
export function formatResultsTable(rows: ResultRow[]): string;

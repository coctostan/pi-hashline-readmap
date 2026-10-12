import { join } from "node:path";

export const WARM_REDUCTION_THRESHOLD = 0.5;
export const COLD_OVERHEAD_LIMIT_SECONDS = 2.0;
export const LAZY_SHARE_THRESHOLD = 0.8;

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("median requires at least one value");
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function evaluateStartupGate({ a, b, c, d, dCold }) {
  const overhead = b - a;
  const bundleReduction = overhead > 0 ? (b - d) / overhead : 0;
  const coldOverhead = dCold - a;
  const bundlePasses = bundleReduction >= WARM_REDUCTION_THRESHOLD && coldOverhead < COLD_OVERHEAD_LIMIT_SECONDS;
  const lazyShareOfBundle = b - d > 0 ? (b - c) / (b - d) : 0;
  const outcome = !bundlePasses ? "NO-GO" : lazyShareOfBundle >= LAZY_SHARE_THRESHOLD ? "LAZY" : "BUNDLE";
  return { bundleReduction, coldOverhead, bundlePasses, lazyShareOfBundle, outcome };
}

export function gateFromRuns(runs) {
  return evaluateStartupGate({
    a: median(runs.a.warm),
    b: median(runs.b.warm),
    c: median(runs.c.warm),
    d: median(runs.d.warm),
    dCold: median(runs.d.cold),
  });
}

export function extractOutcome(markdown) {
  const matches = [...markdown.matchAll(/^Outcome: (BUNDLE|LAZY|NO-GO)\s*$/gm)];
  return matches.length === 1 ? matches[0][1] : null;
}

export function extractMeasurements(markdown) {
  const match = /```json startup-measurements\n([\s\S]*?)\n```/.exec(markdown);
  return match ? JSON.parse(match[1]) : null;
}

export function buildRunPlan({ repo, lazyDir, bundleDir, runs = 5, pi = "pi" }) {
  if (!Number.isInteger(runs) || runs < 3) throw new Error("runs must be an integer >= 3");
  const base = ["--no-session", "--no-extensions"];
  const variants = [
    { variant: "a", args: [...base, "--list-models"] },
    { variant: "b", args: [...base, "-e", join(repo, "index.ts"), "--list-models"] },
  ];
  if (lazyDir) variants.push({ variant: "c", args: [...base, "-e", join(lazyDir, "index.ts"), "--list-models"] });
  // (d) passes the package directory so Pi resolves `pi.extensions` from its package.json.
  if (bundleDir) variants.push({ variant: "d", args: [...base, "-e", bundleDir, "--list-models"] });
  const plan = [];
  for (const { variant, args } of variants) {
    plan.push({ variant, mode: "warm", command: pi, args, env: {}, repeat: runs, discardFirst: true });
    plan.push({ variant, mode: "cold", command: pi, args, env: { JITI_FS_CACHE: "false" }, repeat: runs, discardFirst: false });
  }
  return plan;
}

export function summarizeResults(runs) {
  const baseline = median(runs.a.warm);
  const rows = [];
  for (const variant of Object.keys(runs)) {
    for (const mode of ["warm", "cold"]) {
      const medianSeconds = median(runs[variant][mode]);
      rows.push({ variant, mode, medianSeconds, overheadSeconds: medianSeconds - baseline });
    }
  }
  return rows;
}

export function formatResultsTable(rows) {
  const lines = ["| Variant | Mode | Median (s) | Overhead vs (a) (s) |", "|---|---|---|---|"];
  for (const row of rows) {
    lines.push(`| ${row.variant} | ${row.mode} | ${row.medianSeconds.toFixed(2)} | ${row.overheadSeconds.toFixed(2)} |`);
  }
  return lines.join("\n");
}

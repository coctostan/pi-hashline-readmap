#!/usr/bin/env node
// Startup benchmark for Pi extension loading. See docs/startup-performance.md.
//   node scripts/bench-startup.mjs [--runs N] [--repo DIR] [--lazy-dir DIR] [--bundle-dir DIR]
//                                  [--pi CMD] [--dry-run] [--json]
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { buildRunPlan, formatResultsTable, summarizeResults } from "./startup-bench-lib.mjs";

function parseArgs(argv) {
  const options = { runs: 5, repo: process.cwd(), pi: "pi", dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} requires a value`);
      return next;
    };
    if (arg === "--runs") options.runs = Number(value());
    else if (arg === "--repo") options.repo = resolve(value());
    else if (arg === "--lazy-dir") options.lazyDir = resolve(value());
    else if (arg === "--bundle-dir") options.bundleDir = resolve(value());
    else if (arg === "--pi") options.pi = value();
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function describeEntry(entry) {
  const env = Object.entries(entry.env).map(([key, val]) => ` [${key}=${val}]`).join("");
  const warmup = entry.discardFirst ? " (+1 warm-up)" : "";
  return `${entry.variant} ${entry.mode} x${entry.repeat}${warmup}: ${entry.command} ${entry.args.join(" ")}${env}`;
}

function timeOnce(entry) {
  const started = performance.now();
  const result = spawnSync(entry.command, entry.args, {
    env: { ...process.env, ...entry.env },
    stdio: "ignore",
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${describeEntry(entry)} failed (status ${result.status}${result.error ? `, ${result.error.message}` : ""})`);
  }
  return (performance.now() - started) / 1000;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildRunPlan(options);
  if (options.dryRun) {
    for (const entry of plan) console.log(describeEntry(entry));
  } else {
    const runs = {};
    for (const entry of plan) {
      if (entry.discardFirst) timeOnce(entry);
      const samples = Array.from({ length: entry.repeat }, () => timeOnce(entry));
      (runs[entry.variant] ??= {})[entry.mode] = samples;
    }
    console.log(options.json ? JSON.stringify({ runs }, null, 2) : formatResultsTable(summarizeResults(runs)));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

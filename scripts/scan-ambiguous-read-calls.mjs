#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;

export const isModeUsingRead = (input) => has(input, "symbol") || input.map === true || has(input, "bundle");

export const isBaselineAmbiguousRead = (input) => {
  const range = has(input, "offset") || has(input, "limit") || input.map === true;
  return (
    (has(input, "symbol") && range) ||
    (has(input, "bundle") && range) ||
    (has(input, "bundle") && !has(input, "symbol"))
  );
};

const rate = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator;
const route = (message, fallback) => typeof message?.provider === "string" && typeof (message.model ?? message.modelId) === "string" ? `${message.provider}/${message.model ?? message.modelId}` : fallback;

const ISO_DATE_OR_TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/;

export const parseIsoDate = (raw, label) => {
  const match = typeof raw === "string" ? ISO_DATE_OR_TIMESTAMP_RE.exec(raw) : null;
  if (!match) throw new Error(`Invalid ${label}: expected an ISO date or timestamp.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const maxDay = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (day < 1 || day > maxDay) throw new Error(`Invalid ${label}: expected an ISO date or timestamp.`);
  if (hourText !== undefined) {
    if (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59) {
      throw new Error(`Invalid ${label}: expected an ISO date or timestamp.`);
    }
    if (zone !== "Z") {
      const [offsetHour, offsetMinute] = zone.slice(1).split(":").map(Number);
      if (offsetHour > 23 || offsetMinute > 59) throw new Error(`Invalid ${label}: expected an ISO date or timestamp.`);
    }
  }
  const value = new Date(raw);
  if (!Number.isFinite(value.getTime())) throw new Error(`Invalid ${label}: expected an ISO date or timestamp.`);
  return value;
};

const assertValidDate = (value, label) => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`Invalid ${label}: expected an ISO date or timestamp.`);
  }
  return value;
};

async function collectSessionFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
    }
  }
  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

export async function scanSessionDirectory(directory, options = {}) {
  const compactSince = assertValidDate(options.compactSince ?? new Date("2026-05-16T00:00:00Z"), "compactSince");
  const through = options.through === undefined ? Infinity : assertValidDate(options.through, "through").getTime();
  const files = await collectSessionFiles(directory);
  let sessions = 0;
  let totalReads = 0;
  let modeUsingReads = 0;
  let ambiguousReads = 0;
  let selfCorrected = 0;
  const affected = new Set();
  const routeCounts = new Map();
  const periods = {
    before: { modeUsingReads: 0, ambiguousReads: 0 },
    after: { modeUsingReads: 0, ambiguousReads: 0 },
  };

  for (const filePath of files) {
    const lines = (await readFile(filePath, "utf8")).split("\n");
    const records = [];
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].trim()) continue;
      try { records.push({ row: JSON.parse(lines[index]), line: index + 1 }); }
      catch { throw new Error(`Invalid JSON in ${filePath}:${index + 1}.`); }
    }
    const sessionRecord = records.find(({ row }) => row.type === "session");
    if (!sessionRecord) throw new Error(`Missing session header in ${filePath}.`);
    const session = sessionRecord.row;
    const sessionTime = parseIsoDate(session.timestamp, `session timestamp in ${filePath}:${sessionRecord.line}`).getTime();
    if (sessionTime > through) continue;

    sessions++;
    const period = sessionTime < compactSince.getTime() ? periods.before : periods.after;
    let currentRoute = "unknown/unknown";
    const reads = [];
    for (const { row, line } of records) {
      const rowTime = row.timestamp === undefined
        ? sessionTime
        : parseIsoDate(row.timestamp, `row timestamp in ${filePath}:${line}`).getTime();
      if (rowTime > through) continue;
      if (row.type === "model_change" && typeof row.provider === "string" && typeof row.modelId === "string") {
        currentRoute = `${row.provider}/${row.modelId}`;
      }
      if (row.type !== "message" || row.message?.role !== "assistant") continue;
      currentRoute = route(row.message, currentRoute);
      const content = row.message.content ?? [];
      if (!Array.isArray(content)) throw new Error(`Invalid assistant content in ${filePath}:${line}.`);
      for (const item of content) {
        if (item?.type === "toolCall" && item.name === "read" && item.arguments && typeof item.arguments === "object") {
          reads.push({ input: item.arguments, route: currentRoute });
        }
      }
    }

    let sessionAffected = false;
    for (let index = 0; index < reads.length; index++) {
      const { input, route: modelRoute } = reads[index];
      totalReads++;
      if (isModeUsingRead(input)) { modeUsingReads++; period.modeUsingReads++; }
      if (!isBaselineAmbiguousRead(input)) continue;
      ambiguousReads++;
      period.ambiguousReads++;
      sessionAffected = true;
      routeCounts.set(modelRoute, (routeCounts.get(modelRoute) ?? 0) + 1);
      if (reads.slice(index + 1).some(({ input: later }) => later.path === input.path && !isBaselineAmbiguousRead(later))) {
        selfCorrected++;
      }
    }
    if (sessionAffected) affected.add(session.id ?? filePath);
  }

  return {
    sessions,
    totalReads,
    modeUsingReads,
    ambiguousReads,
    affectedSessions: affected.size,
    selfCorrected,
    routes: Object.fromEntries([...routeCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    before: { ...periods.before, rate: rate(periods.before.ambiguousReads, periods.before.modeUsingReads) },
    after: { ...periods.after, rate: rate(periods.after.ambiguousReads, periods.after.modeUsingReads) },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const directory = args[0];
  const usage = "Usage: scan-ambiguous-read-calls.mjs <session-root> [--through ISO] [--compact-since ISO] (scans recursively)";
  if (!directory) throw new Error(usage);
  const allowedFlags = new Set(["--through", "--compact-since"]);
  const parsedFlags = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    if (!allowedFlags.has(flag)) throw new Error(`${usage}\nUnknown option: ${flag}.`);
    if (parsedFlags.has(flag)) throw new Error(`${usage}\nDuplicate option: ${flag}.`);
    const raw = args[index + 1];
    if (!raw || raw.startsWith("--")) throw new Error(`${usage}\nInvalid ${flag}: expected an ISO date or timestamp.`);
    try { parsedFlags.set(flag, parseIsoDate(raw, flag)); }
    catch (error) { throw new Error(`${usage}\n${error.message}`); }
  }
  const through = parsedFlags.get("--through");
  const compactSince = parsedFlags.get("--compact-since");
  console.log(JSON.stringify(await scanSessionDirectory(directory, {
    ...(through ? { through } : {}),
    ...(compactSince ? { compactSince } : {}),
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

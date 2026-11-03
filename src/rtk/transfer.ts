import { dropMarker, type Drop } from "./drops.ts";

// A whole rsync progress row, per its progress.c: "%15s %3d%% %7.2f%s %s%s" (3.2.7) or "%15sB %3d%% %7sB/s %s%s"
// (master): size, percent, rate, remaining time, then " (xfr#N, to-chk=N/N)" on a file's last row; openrsync (macOS)
// prints "(xfer#N, to-check=N/N)". Updates rewritten in place arrive as several rows joined by '\r' on one line.
const RSYNC_ROW = String.raw`\s*[\d,.]+[KMGTP]?B? +\d{1,3}% +[\d,.]+[kKMGTP]?B\/s +(?:\d+:\d{2}:\d{2}|\?\?:\?\?:\?\?)(?: \((?:xfr|xfer)#\d+, (?:to|ir)-(?:chk|check)=\d+\/\d+\))?`;
const RSYNC_PROGRESS_RE = new RegExp(String.raw`^(?:${RSYNC_ROW})+\s*$`);
// A whole scp progress row, per OpenSSH's progressmeter.c: the file name (free text), " %3d%% ", a "%4lld%c%s"
// size, a "%3lld.%1lld%cB" rate (any case, issue 044) then "/s ", and an ETA, a total time, "  --:-- ETA" or "- stalled -".
const SCP_PROGRESS_RE = /\s\d{1,3}% +\d+(?:[KMGT]B)? +\d+\.\d(?:[KMGTkmgt]B| +)\/s +(?:(?:\d+:)?\d{2}:\d{2}(?: ETA)?|--:-- ETA|- stalled -)\s*$/;
// rsync -av header: "sending incremental file list" / "receiving incremental file list"
const RSYNC_AV_HEADER_RE = /^(sending|receiving) incremental file list$/;
// rsync -av file list entries: no whitespace, only path-safe chars (word chars, dots, slashes, hyphens)
const RSYNC_AV_FILE_RE = /^[\w./\-]+$/;
const RSYNC_AV_STATUS_RE = /^(done|transfer-complete)$/i;

const SIGNAL_PATTERNS: RegExp[] = [
  /sent .* bytes/, // rsync summary
  /Permission denied/i,
  /Connection refused/i,
  /No such file/i,
  /error/i,
];

// Each tool's rows are noise only in its own output: an scp row ends a line of free text, which rsync prints as a
// file name (`deleting report 100%  1234   1.2KB/s   00:00`). With no command given, both apply.
function isNoise(line: string, tool: string | undefined): boolean {
  if (tool !== "scp" && (RSYNC_PROGRESS_RE.test(line) || RSYNC_AV_HEADER_RE.test(line))) return true;
  return tool !== "rsync" && SCP_PROGRESS_RE.test(line);
}

function isSignal(line: string): boolean {
  return SIGNAL_PATTERNS.some((p) => p.test(line));
}

export function isTransferCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  return c === "scp" || c.startsWith("scp ") || c === "rsync" || c.startsWith("rsync ");
}

// rsync's file list is kept up to this many entries, then counted.
const FILE_LIST_BUDGET = 10;
// What opens rsync's file list: its `-v` header, or openrsync's (macOS) `Transfer starting: N files`.
const FILE_LIST_START_RE = /^(?:(?:sending|receiving) incremental file list|Transfer starting: \d+ files)$/;

/** The indices of rsync's file list entries: path-shaped lines after its start, up to the blank line ending it. */
function fileListEntries(lines: string[]): Set<number> {
  const entries = new Set<number>();
  let inList = false;
  lines.forEach((line, i) => {
    if (FILE_LIST_START_RE.test(line)) inList = true;
    else if (line.trim() === "") inList = false;
    else if (inList && !isSignal(line) && RSYNC_AV_FILE_RE.test(line) && !RSYNC_AV_STATUS_RE.test(line)) entries.add(i);
  });
  return entries;
}

export function compressTransferOutput(output: string, drops: Drop[] = [], command?: string): string | null {
  const tool = command?.trim().split(/\s+/)[0].toLowerCase();
  if (output.length === 0) return null; // AC-12: null for empty (must be before short-circuit)
  const lines = output.split("\n");
  if (lines.length < 10) return output; // AC-9: short-circuit

  const entries = fileListEntries(lines);
  let listed = 0;
  const kept: string[] = [];
  lines.forEach((line, i) => {
    if (entries.has(i)) {
      listed++;
      if (listed <= FILE_LIST_BUDGET) kept.push(line);
      else if (listed === FILE_LIST_BUDGET + 1) {
        kept.push(dropMarker(drops, entries.size - FILE_LIST_BUDGET, "files", `... and ${entries.size - FILE_LIST_BUDGET} more files`));
      }
    } else if (isSignal(line) || !isNoise(line, tool)) {
      kept.push(line);
    }
  });
  if (kept.length === 0 || kept.every((line) => line.trim() === "")) return null;
  return kept.join("\n");
}

import { dropMarker, type Drop } from "./drops.ts";

// rsync per-file progress: "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)"
const RSYNC_PROGRESS_RE = /^\s+[\d,]+\s+\d+%/;
// rsync xfr detail: lines with (xfr#N, to-chk=N/N)
const RSYNC_XFR_RE = /\(\s*xfr#\d+/;
// scp progress bar: "file.txt    100%  1234   1.2KB/s   00:00"
const SCP_PROGRESS_RE = /\d+%\s+\d+\s+[\d.]+[KMGkmg]B\/s/;
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

function isNoise(line: string): boolean {
  return RSYNC_PROGRESS_RE.test(line) || RSYNC_XFR_RE.test(line) || SCP_PROGRESS_RE.test(line) || RSYNC_AV_HEADER_RE.test(line);
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

export function compressTransferOutput(output: string, drops: Drop[] = []): string | null {
  if (output.length === 0) return null; // AC-12: null for empty (must be before short-circuit)
  const lines = output.split("\n");
  if (lines.length < 10) return output; // AC-9: short-circuit

  const isListedFile = (line: string) => !isSignal(line) && RSYNC_AV_FILE_RE.test(line) && !RSYNC_AV_STATUS_RE.test(line);
  const files = lines.filter(isListedFile).length;
  let listed = 0;
  const kept: string[] = [];
  for (const line of lines) {
    if (isListedFile(line)) {
      listed++;
      if (listed <= FILE_LIST_BUDGET) kept.push(line);
      else if (listed === FILE_LIST_BUDGET + 1) {
        kept.push(dropMarker(drops, files - FILE_LIST_BUDGET, "files", `... and ${files - FILE_LIST_BUDGET} more files`));
      }
    } else if (isSignal(line) || !isNoise(line)) {
      kept.push(line);
    }
  }
  if (kept.length === 0 || kept.every((line) => line.trim() === "")) return null;
  return kept.join("\n");
}

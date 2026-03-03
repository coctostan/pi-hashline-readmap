// rsync per-file progress: "      1,234 100%    1.00MB/s    0:00:00 (xfr#1, to-chk=5/7)"
const RSYNC_PROGRESS_RE = /^\s+[\d,]+\s+\d+%/;
// rsync xfr detail: lines with (xfr#N, to-chk=N/N)
const RSYNC_XFR_RE = /\(\s*xfr#\d+/;
// scp progress bar: "file.txt    100%  1234   1.2KB/s   00:00"
const SCP_PROGRESS_RE = /\d+%\s+\d+\s+[\d.]+[KMG]B\/s/;

const SIGNAL_PATTERNS: RegExp[] = [
  /sent .* bytes/, // rsync summary
  /Permission denied/i,
  /Connection refused/i,
  /No such file/i,
  /error/i,
];

function isNoise(line: string): boolean {
  return RSYNC_PROGRESS_RE.test(line) || RSYNC_XFR_RE.test(line) || SCP_PROGRESS_RE.test(line);
}

function isSignal(line: string): boolean {
  return SIGNAL_PATTERNS.some((p) => p.test(line));
}

export function isTransferCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  return c === "scp" || c.startsWith("scp ") || c === "rsync" || c.startsWith("rsync ");
}

export function compressTransferOutput(output: string): string | null {
  if (output.length === 0) return null; // AC-12: null for empty (must be before short-circuit)
  const lines = output.split("\n");
  if (lines.length < 10) return output; // AC-9: short-circuit

  const kept: string[] = [];
  for (const line of lines) {
    if (isSignal(line)) {
      kept.push(line);
    } else if (!isNoise(line)) {
      kept.push(line);
    }
  }
  return kept.join("\n");
}

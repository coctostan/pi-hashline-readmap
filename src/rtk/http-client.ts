export function isHttpCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  if (c.startsWith("curl ") || c === "curl") return true;
  if (c.startsWith("wget ") || c === "wget") return true;
  // httpie: starts with "http " but not "httpd" or "https-"
  if ((c === "http" || c.startsWith("http ")) && !c.startsWith("httpd") && !c.startsWith("https-")) return true;
  return false;
}

// Curl progress bar patterns
const CURL_PROGRESS_RE = /^\s*%\s+Total|^\s*\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+|Dload\s+Upload/;
// Wget download progress: "     0K .       100%"
const WGET_PROGRESS_RE = /^\s*\d+K\s+\./;

export function compressHttpOutput(output: string): string | null {
  const lines = output.split("\n");
  if (lines.length < 10) return null;

  const kept: string[] = [];
  let bodyLineCount = 0;
  let inBody = false;
  let truncatedCount = 0;

  for (const line of lines) {
    // Strip curl progress bars
    if (CURL_PROGRESS_RE.test(line)) continue;
    // Strip wget download progress
    if (WGET_PROGRESS_RE.test(line)) continue;

    // Detect body start (after empty line following headers)
    if (!inBody && line.trim() === "" && kept.some((l) => /^(HTTP\/|< HTTP\/|Content-|Host:)/i.test(l.trim()))) {
      inBody = true;
      kept.push(line);
      continue;
    }

    if (inBody) {
      bodyLineCount++;
      if (bodyLineCount <= 200) {
        kept.push(line);
      } else {
        truncatedCount++;
      }
    } else {
      kept.push(line);
    }
  }

  // Fallback for pure-body output (e.g. curl -s): if body detection never triggered,
  // treat the entire kept output as the body and truncate if needed.
  if (!inBody && kept.length > 200) {
    const excess = kept.splice(200);
    truncatedCount += excess.length;
  }

  if (truncatedCount > 0) {
    kept.push(`[... ${truncatedCount} more lines]`);
  }

  return kept.join("\n");
}

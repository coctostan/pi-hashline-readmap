export function isHttpCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  if (c.startsWith("curl ") || c === "curl") return true;
  if (c.startsWith("wget ") || c === "wget") return true;
  // httpie: starts with "http " but not "httpd" or "https-"
  if ((c === "http" || c.startsWith("http ")) && !c.startsWith("httpd") && !c.startsWith("https-")) return true;
  return false;
}

const CURL_PROGRESS_HEADER_RE =
  /^\s*%\s+Total\s+%\s+Received\s+%\s+Xferd\b|^\s*Dload\s+Upload\s+Total\s+Spent\s+Left\s+Speed\s*$/;
const CURL_PROGRESS_ROW_RE =
  /^\s*\d{1,3}\s+\S+\s+\d{1,3}\s+\S+\s+\d{1,3}\s+\S+\s+\S+\s+\S+\s+(?:\d+|--):(?:\d{2}|--):(?:\d{2}|--)\s+(?:\d+|--):(?:\d{2}|--):(?:\d{2}|--)\s+(?:\d+|--):(?:\d{2}|--):(?:\d{2}|--)\s+\S+\s*$/;
// Wget download progress: "     0K .       100%"
const WGET_PROGRESS_RE = /^\s*\d+K\s+\./;
const HTTP_HEADER_RE = /^(HTTP\/|< HTTP\/|Content-|Host:)/i;

function isCurlProgressLine(line: string): boolean {
  return CURL_PROGRESS_HEADER_RE.test(line) || CURL_PROGRESS_ROW_RE.test(line);
}

export function compressHttpOutput(output: string): string | null {
  const lines = output.split("\n");
  const hasHttpHeaders = lines.some((line) => HTTP_HEADER_RE.test(line.trim()));
  if (lines.length < 10) return hasHttpHeaders ? output : null;

  const kept: string[] = [];
  let bodyLineCount = 0;
  let inBody = false;
  let truncatedCount = 0;

  for (const line of lines) {
    // Strip curl progress bars only when the complete progress shape matches.
    if (isCurlProgressLine(line)) continue;
    // Strip wget download progress.
    if (WGET_PROGRESS_RE.test(line)) continue;

    // Detect body start (after empty line following headers).
    if (!inBody && line.trim() === "" && kept.some((keptLine) => HTTP_HEADER_RE.test(keptLine.trim()))) {
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

  // Pure-body output (for example curl -s) is truncated at the same 200-line cap.
  if (!inBody && kept.length > 200) {
    const excess = kept.splice(200);
    truncatedCount += excess.length;
  }

  if (truncatedCount > 0) {
    kept.push(`[... ${truncatedCount} more lines]`);
  }

  if (kept.length === 0 || kept.every((line) => line.trim() === "")) {
    return null;
  }

  const result = kept.join("\n");
  if (result === output && !hasHttpHeaders) {
    return null;
  }
  return result;
}

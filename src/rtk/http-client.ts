import { dropMarker, outputLines, type Drop } from "./drops.ts";

export function isHttpCommand(cmd: string): boolean {
  const c = cmd.trim().toLowerCase();
  if (c.startsWith("curl ") || c === "curl") return true;
  if (c.startsWith("wget ") || c === "wget") return true;
  // httpie: starts with "http " but not "httpd" or "https-"
  if ((c === "http" || c.startsWith("http ")) && !c.startsWith("httpd") && !c.startsWith("https-")) return true;
  return false;
}

// curl's lib/progress.c header, both lines whole (releases differ in spacing).
const CURL_PROGRESS_HEADER_RE =
  /^\s*%\s+Total\s+%\s+Received\s+%\s+Xferd\s+Average\s+Speed\s+Time\s+Time\s+Time\s+Current\s*$|^\s*Dload\s+Upload\s+Total\s+Spent\s+Left\s+Speed\s*$/;
// A whole curl progress row, per lib/progress.c: three "%3d %s" percent-size pairs, the download and upload speeds,
// three times and the current speed, each field at its printf width. Sizes, times and gaps differ by release; updates
// rewritten in place arrive as several rows joined by '\r' on one line.
const padInt = (width: number) =>
  `(?:${Array.from({ length: width }, (_, spaces) => `${" ".repeat(spaces)}\\d{${width - spaces}}`).join("|")})`;
function curlRow(size: string, time: string, gap: string, beforeTimes: string): string {
  const pair = `${padInt(3)} ${size}`;
  return `${pair}${gap}${pair}${gap}${pair}${gap}${size}${gap}${size}${beforeTimes}${time} ${time} ${time} ${size}`;
}
// A field that outgrows its buffer is cut: a tenth of 10 loses its size unit ("15.10"), an 8-digit day count its "d".
const CLASSIC_TIME = String.raw`(?:--:--:--|${padInt(2)}:\d{2}:\d{2}|${padInt(3)}d \d{2}h|${padInt(7)}d|\d{8})`;
const CURL_ROWS = [
  // curl-8_16_0 and earlier: max5data.
  curlRow(String.raw`(?:${padInt(5)}|${padInt(4)}[kMGTP]|${padInt(2)}\.(?:\d[MG]|10))`, CLASSIC_TIME, "  ", " "),
  // curl-8_17_0: max6data.
  curlRow(String.raw`(?:${padInt(5)}|\d{6}|${padInt(3)}\.(?:\d[kMGTP]|10)|${padInt(5)}[kMGTP])`, CLASSIC_TIME, " ", "  "),
  // curl-8_18_0 and later: max6out and a 7-wide time, blank while unknown.
  curlRow(
    String.raw`(?:${padInt(6)}|${padInt(2)}\.\d{2}[kMGTPE]|${padInt(3)}\.\d[kMGTPE])`,
    String.raw`(?: {7}|  \d{2}:\d{2}|\d:\d{2}:\d{2}|\d{2}h \d{2}m|${padInt(2)}d \d{2}h|${padInt(6)}[dmy]|>99999y)`,
    " ",
    " ",
  ),
];
const CURL_PROGRESS_ROW_RE = new RegExp(`^(?:\\r?(?:${CURL_ROWS.join("|")}))+\\r?$`);
// A whole wget dot-progress row, per wget's src/progress.c: "%6sK", clusters of '.' (',' for resumed bytes), then
// stats. Known length: "%3d%%", a " %4.*f%c" rate (0, 1 or 2 decimals as it shrinks; unit ' ', K, M, G or T),
// then " " ETA or "=" total time. Unknown length: the rate alone, or the rate then "=" total time on the last row.
// A total under 10s is utils.c's print_decimal: "10", "%.1f", "%.1g" ("0.04"), "0.001" or "0".
const WGET_ETA = String.raw`(?:\d+s|\d+m\d+s|\d+h\d+m|\d+d\d+h|\d+d)`;
const WGET_TOTAL = String.raw`=(?:(?:\d{1,2}|\d\.\d|0\.0{0,2}\d)s|${WGET_ETA})`;
const WGET_RATE = String.raw`(?:\d{3,}|\d{2}\.\d|\d\.\d{2})[KMGT ]`;
const WGET_PROGRESS_RE = new RegExp(
  String.raw`^\s*\d+K(?: [.,]+)+ +(?:\d{1,3}% +${WGET_RATE}(?: ${WGET_ETA}|${WGET_TOTAL})|${WGET_RATE}(?:${WGET_TOTAL})?)\s*$`,
);
const HTTP_HEADER_RE = /^(HTTP\/|< HTTP\/|Content-|Host:)/i;

function isCurlProgressLine(line: string): boolean {
  return CURL_PROGRESS_HEADER_RE.test(line) || CURL_PROGRESS_ROW_RE.test(line);
}

export function compressHttpOutput(output: string, drops: Drop[] = []): string | null {
  const lines = outputLines(output);
  const trailingNewline = output.endsWith("\n");
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
    kept.push(dropMarker(drops, truncatedCount, "lines", `[... ${truncatedCount} more lines]`));
  } else if (trailingNewline) {
    kept.push("");
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

import { getCapabilities, hyperlink, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { pathToFileURL } from "node:url";
import { resolveToCwd } from "./path-utils.js";

export const SUMMARY_PREFIX = "↳";
export const EXPAND_HINT = " • Ctrl+O to expand";

export type RendererTheme = {
  fg(style: string, text: string): string;
  bold(text: string): string;
};

export function renderToolLabel(theme: RendererTheme, label: string): string {
  const boldFn = typeof theme.bold === "function" ? theme.bold.bind(theme) : (text: string) => text;
  return theme.fg("toolTitle", boldFn(label));
}

export function linkToolPath(styledText: string, rawPath: string, cwd: string): string {
  try {
    if (!getCapabilities().hyperlinks) return styledText;
    const absolutePath = resolveToCwd(rawPath, cwd);
    return hyperlink(styledText, pathToFileURL(absolutePath).href);
  } catch {
    return styledText;
  }
}

export function appendExpandHint(text: string, hidden: boolean): string {
  return hidden ? `${text}${EXPAND_HINT}` : text;
}

export function summaryLine(summary: string, options: { hidden?: boolean } = {}): string {
  return appendExpandHint(`${SUMMARY_PREFIX} ${summary}`, !!options.hidden);
}

export function isRendererExpanded(options?: { expanded?: boolean }, context?: { expanded?: boolean }): boolean {
  return context?.expanded ?? options?.expanded ?? false;
}

export function normalizeWidth(width: unknown, fallback = 80): number {
  return typeof width === "number" && Number.isFinite(width) && width > 0 ? Math.floor(width) : fallback;
}

export function clampLineToWidth(line: string, width: number | undefined): string {
  if (width === undefined || width === null) return line;
  const normalized = normalizeWidth(width);
  return visibleWidth(line) <= normalized ? line : truncateToWidth(line, normalized);
}

export function clampLinesToWidth(lines: string[], width: number | undefined): string[] {
  if (width === undefined || width === null) return lines;
  return lines.map((line) => clampLineToWidth(line, width));
}

export function wrapLinesToWidth(lines: string[], width: number | undefined): string[] {
  if (width === undefined || width === null) return lines;
  const normalized = normalizeWidth(width);
  return lines.flatMap((line) => {
    if (visibleWidth(line) <= normalized) return [line];
    return wrapTextWithAnsi(line, normalized).map((wrapped) => clampLineToWidth(wrapped, normalized));
  });
}

export interface WrapWithHangingIndentOptions {
  /** Optional transform applied to each produced line (e.g. theme tinting). */
  tint?: (text: string) => string;
}

/**
 * Wrap a single visual row that has a leading prefix (gutter, line number,
 * separator) such that continuation lines are indented to align with the
 * content column. Each produced line is clamped to `width`. If `tint` is
 * provided, it is applied to each output line so theme styling extends across
 * wrapped rows without leaking the prefix into the colored span.
 */
export function wrapWithHangingIndent(
  prefix: string,
  content: string,
  width: number | undefined,
  options: WrapWithHangingIndentOptions = {},
): string[] {
  const tint = options.tint ?? ((text: string) => text);
  if (width === undefined || width === null) return [tint(prefix + content)];
  const normalized = normalizeWidth(width);
  const combined = prefix + content;
  if (visibleWidth(combined) <= normalized) return [tint(combined)];
  const prefixWidth = visibleWidth(prefix);
  const contentWidth = Math.max(1, normalized - prefixWidth);
  const wrapped = wrapTextWithAnsi(content, contentWidth);
  if (wrapped.length === 0) return [tint(clampLineToWidth(prefix, normalized))];
  const indent = " ".repeat(prefixWidth);
  return wrapped.map((line, index) =>
    tint(clampLineToWidth(index === 0 ? prefix + line : indent + line, normalized)),
  );
}
const HASHLINE_CONTENT_RE = /^(\d+:[0-9a-fA-F]+\|)(.*)$/;

export function wrapReadHashlinesForWidth(text: string, width: number | undefined): string {
  if (width === undefined || width === null) return text;
  const normalized = normalizeWidth(width);
  const output: string[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(HASHLINE_CONTENT_RE);
    if (!match) {
      output.push(line);
      continue;
    }
    if (visibleWidth(line) <= normalized) {
      output.push(line);
      continue;
    }

    const prefix = match[1]!;
    const content = match[2] ?? "";
    const prefixWidth = visibleWidth(prefix);
    const contentWidth = Math.max(1, normalized - prefixWidth);
    const wrappedContent = wrapTextWithAnsi(content, contentWidth).map((wrapped) => clampLineToWidth(wrapped, contentWidth));
    if (wrappedContent.length === 0) {
      output.push(clampLineToWidth(prefix, normalized));
      continue;
    }
    output.push(clampLineToWidth(prefix + wrappedContent[0], normalized));
    const indent = " ".repeat(prefixWidth);
    for (const continuation of wrappedContent.slice(1)) {
      output.push(clampLineToWidth(indent + continuation, normalized));
    }
  }
  return output.join("\n");
}

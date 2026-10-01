import { visibleWidth } from "@earendil-works/pi-tui";
import type { DiffData, DiffEntry, DiffSpan } from "./diff-data.js";
import { clampLineToWidth, clampLinesToWidth, getExpandHint, normalizeWidth, wrapWithHangingIndent, type RendererTheme } from "./tui-render-utils.js";

export type TuiDiffMode = "split" | "unified" | "compact" | "summary";
export type RenderTuiDiffInput = { diffData: DiffData; width: number; theme: RendererTheme; expanded: boolean };
export type RenderTuiDiffOutput = { mode: TuiDiffMode; width: number; lines: string[] };

function hasOldSide(data: DiffData): boolean { return data.entries.some((e) => e.kind === "remove" || e.kind === "context"); }
function chooseMode(width: number, data: DiffData): TuiDiffMode {
  if (width < 24) return "summary";
  if (width < 50) return "compact";
  // Split mode wastes half the pane on pure-add diffs (pending creates,
  // write to a new file) so fall back to unified when there is no old side.
  if (width >= 100 && hasOldSide(data)) return "split";
  return "unified";
}
function hunkCount(data: DiffData): number { return Math.max(1, data.blockRanges?.length ?? (data.entries.some((e) => e.kind === "add" || e.kind === "remove") ? 1 : 0)); }
function compactHeader(data: DiffData): string { return `↳ diff +${data.stats.added} -${data.stats.removed}`; }
function header(data: DiffData, mode: TuiDiffMode, width: number): string {
  if (mode === "summary" && width <= 10) return `↳ diff +${data.stats.added}`;
  const full = `${compactHeader(data)} • ${hunkCount(data)} hunk • 1 file • ${mode === "split" ? "split" : "unified"}`;
  return visibleWidth(full) <= width ? full : clampLineToWidth(compactHeader(data), width);
}
function lineNo(entry: DiffEntry): string { return String(entry.kind === "add" ? entry.newLine : entry.kind === "remove" ? entry.oldLine : entry.kind === "context" ? entry.newLine : ""); }
function gutterMarker(entry: DiffEntry): string { return entry.kind === "add" ? "+" : entry.kind === "remove" ? "-" : " "; }
function textOf(entry: DiffEntry): string { return "text" in entry ? entry.text : ""; }
function padRightVisual(line: string, width: number): string { const visible = visibleWidth(line); return visible >= width ? line : line + " ".repeat(width - visible); }
function tint(theme: RendererTheme, entry: DiffEntry, text: string): string { return entry.kind === "add" ? theme.fg("success", text) : entry.kind === "remove" ? theme.fg("error", text) : theme.fg("toolOutput", text); }
function spans(theme: RendererTheme, spans: DiffSpan[] | undefined, fallback: string): string { return spans?.map((s) => s.kind === "add" ? theme.fg("success", s.text) : s.kind === "remove" ? theme.fg("error", s.text) : s.text).join("") ?? fallback; }
function inlineText(input: RenderTuiDiffInput, index: number, entry: DiffEntry): string {
  const pair = input.diffData.inlineDiffs?.find((d) => entry.kind === "remove" ? d.removeLineIndex === index : entry.kind === "add" ? d.addLineIndex === index : false);
  if (!pair) return textOf(entry);
  return entry.kind === "remove" ? spans(input.theme, pair.removeSpans, textOf(entry)) : entry.kind === "add" ? spans(input.theme, pair.addSpans, textOf(entry)) : textOf(entry);
}
function unifiedRows(input: RenderTuiDiffInput, width: number): string[] {
  const rows: string[] = [];
  for (const [i, e] of input.diffData.entries.entries()) {
    if (e.kind === "meta") continue;
    const prefix = `▌${gutterMarker(e)} ${lineNo(e)} │ `;
    const tinted = wrapWithHangingIndent(prefix, inlineText(input, i, e), width, { tint: (text) => tint(input.theme, e, text) });
    rows.push(...tinted);
  }
  return rows;
}
function compactRows(input: RenderTuiDiffInput, width: number): string[] {
  const rows: string[] = [];
  for (const [i, e] of input.diffData.entries.entries()) {
    if (e.kind !== "add" && e.kind !== "remove") continue;
    const prefix = `▌${gutterMarker(e)} ${lineNo(e)} `;
    const tinted = wrapWithHangingIndent(prefix, inlineText(input, i, e), width, { tint: (text) => tint(input.theme, e, text) });
    rows.push(...tinted);
  }
  return rows;
}
function splitRows(input: RenderTuiDiffInput, width: number): string[] {
  const pane = Math.max(10, Math.floor((width - 3) / 2));
  const rows = [`${padRightVisual("old", pane)} │ new`];
  const blankPane = " ".repeat(pane);
  for (const [i, e] of input.diffData.entries.entries()) {
    if (e.kind === "remove") {
      const left = wrapWithHangingIndent(`▌- ${e.oldLine} │ `, inlineText(input, i, e), pane, { tint: (text) => tint(input.theme, e, text) });
      for (const line of left) rows.push(`${padRightVisual(line, pane)} │ ${blankPane}`);
    } else if (e.kind === "add") {
      const right = wrapWithHangingIndent(`▌+ ${e.newLine} │ `, inlineText(input, i, e), pane, { tint: (text) => tint(input.theme, e, text) });
      for (const line of right) rows.push(`${blankPane} │ ${line}`);
    } else if (e.kind === "context") {
      const left = wrapWithHangingIndent(`▌  ${e.oldLine} │ `, e.text, pane, { tint: (text) => tint(input.theme, e, text) });
      const right = wrapWithHangingIndent(`▌  ${e.newLine} │ `, e.text, pane, { tint: (text) => tint(input.theme, e, text) });
      const maxLen = Math.max(left.length, right.length);
      for (let k = 0; k < maxLen; k++) {
        const l = left[k] ?? blankPane;
        const r = right[k] ?? blankPane;
        rows.push(`${padRightVisual(l, pane)} │ ${r}`);
      }
    }
  }
  return rows;
}
function hiddenHint(hiddenLines: number, hiddenHunks: number, width: number): string {
  const forms = [
    `… (${hiddenLines} more diff lines • ${hiddenHunks} more hunk${hiddenHunks === 1 ? "" : "s"}${getExpandHint()})`,
    `… (${hiddenLines} more lines • ${hiddenHunks} hunks)`,
    `… (+${hiddenLines} • +${hiddenHunks}h)`,
    "…",
  ];
  return forms.find((form) => visibleWidth(form) <= width) ?? "…";
}
export function renderTuiDiff(input: RenderTuiDiffInput): RenderTuiDiffOutput {
  const width = normalizeWidth(input.width);
  const mode = chooseMode(width, input.diffData);
  const lines = [header(input.diffData, mode, width)];
  if (!input.expanded) return { mode, width, lines: clampLinesToWidth([...lines, hiddenHint(input.diffData.entries.length, hunkCount(input.diffData), width)], width) };
  if (mode === "summary") return { mode, width, lines: clampLinesToWidth(lines, width) };
  const rows = mode === "split" ? splitRows(input, width) : mode === "compact" ? compactRows(input, width) : unifiedRows(input, width);
  return { mode, width, lines: [...lines, ...rows] };
}

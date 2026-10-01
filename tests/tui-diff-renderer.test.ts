import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderTuiDiff } from "../src/tui-diff-renderer.js";
import type { DiffData } from "../src/diff-data.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters as plain } from "node:util";
import { vi } from "vitest";
import { initTheme, keyHint } from "@earendil-works/pi-coding-agent";

vi.unmock("@earendil-works/pi-coding-agent");
initTheme("dark", false);
const hostEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const hostTui = await import(pathToFileURL(
  createRequire(hostEntry).resolve("@earendil-works/pi-tui")
).href);
const { KeybindingsManager: HostKeybindingsManager } = await import(
  new URL("./core/keybindings.js", hostEntry).href
);
const previousBindings = hostTui.getKeybindings();
beforeEach(() => hostTui.setKeybindings(new HostKeybindingsManager()));
afterEach(() => hostTui.setKeybindings(previousBindings));

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
const diffData: DiffData = { version: 1, stats: { added: 2, removed: 1, context: 1 }, entries: [
  { kind: "context", oldLine: 1, newLine: 1, text: "one" },
  { kind: "remove", oldLine: 2, text: "two" },
  { kind: "add", newLine: 2, text: "TWO" },
  { kind: "add", newLine: 3, text: "three" },
], inlineDiffs: [{ removeLineIndex: 1, addLineIndex: 2, removeSpans: [{ kind: "remove", text: "two" }], addSpans: [{ kind: "add", text: "TWO" }] }] };

const identityTheme = { fg: (_kind: string, text: string) => text } as any;

const markerDiffData: DiffData = {
  version: 1,
  entries: [
    { kind: "remove", oldLine: 1, text: "one" },
    { kind: "add", newLine: 1, text: "ONE" },
    { kind: "context", oldLine: 2, newLine: 2, text: "two" },
  ],
  stats: { added: 1, removed: 1, context: 1 },
  blockRanges: [{ kind: "add", startLine: 1, endLine: 2 }],
};

const identicalSameLineDiffData: DiffData = {
  version: 1,
  entries: [
    { kind: "remove", oldLine: 1, text: "same" },
    { kind: "add", newLine: 1, text: "same" },
  ],
  stats: { added: 1, removed: 1, context: 0 },
  blockRanges: [{ kind: "add", startLine: 1, endLine: 1 }],
};

describe("renderTuiDiff", () => {
  it("renders unified, compact, split, and summary modes within width", () => {
    const wide = renderTuiDiff({ diffData, width: 120, theme, expanded: true });
    expect(wide.mode).toBe("split");
    expect(wide.lines.join("\n")).toContain("old");
    expect(wide.lines.join("\n")).toContain("new");
    const normal = renderTuiDiff({ diffData, width: 80, theme, expanded: true });
    expect(normal.mode).toBe("unified");
    expect(normal.lines[0]).toBe("↳ diff +2 -1 • 1 hunk • 1 file • unified");
    expect(normal.lines.join("\n")).toContain("▌+ 2 │ TWO");
    const narrow = renderTuiDiff({ diffData, width: 28, theme, expanded: true });
    expect(narrow.mode).toBe("compact");
    expect(narrow.lines[0]).toBe("↳ diff +2 -1");
    const tiny = renderTuiDiff({ diffData, width: 10, theme, expanded: true });
    expect(tiny.mode).toBe("summary");
    expect(tiny.lines).toEqual(["↳ diff +2"]);
    for (const rendered of [wide, normal, narrow, tiny]) expect(rendered.lines.every((line) => visibleWidth(line) <= rendered.width)).toBe(true);
  });

  it("emits textual gutter markers without relying on color", () => {
    const normal = renderTuiDiff({ diffData: markerDiffData, width: 80, theme: identityTheme, expanded: true });
    const text = normal.lines.join("\n");
    expect(text).toContain("▌- 1 │ one");
    expect(text).toContain("▌+ 1 │ ONE");
    expect(text).toContain("▌  2 │ two");
  });

  it("same-line add and remove rows with identical text are distinct when color is stripped", () => {
    const normal = renderTuiDiff({ diffData: identicalSameLineDiffData, width: 80, theme: identityTheme, expanded: true });
    const bodyRows = normal.lines.filter((line) => line.includes("same"));
    expect(bodyRows).toHaveLength(2);
    expect(new Set(bodyRows).size).toBe(2);
    expect(bodyRows[0]?.startsWith("▌- ")).toBe(true);
    expect(bodyRows[1]?.startsWith("▌+ ")).toBe(true);
  });

  it("compact and split modes also emit textual gutter markers", () => {
    const compact = renderTuiDiff({ diffData: markerDiffData, width: 28, theme: identityTheme, expanded: true });
    expect(compact.mode).toBe("compact");
    expect(compact.lines.join("\n")).toContain("▌- 1 one");
    expect(compact.lines.join("\n")).toContain("▌+ 1 ONE");

    const split = renderTuiDiff({ diffData: markerDiffData, width: 120, theme: identityTheme, expanded: true });
    expect(split.mode).toBe("split");
    const splitText = split.lines.join("\n");
    expect(splitText).toContain("▌- 1 │ one");
    expect(splitText).toContain("▌+ 1 │ ONE");
    expect(splitText).toContain("▌  2 │ two");
  });

  it("renders collapsed progressive hidden-content hints", () => {
    const collapsed = renderTuiDiff({ diffData, width: 80, theme, expanded: false });
    expect(collapsed.lines[0]).toBe("↳ diff +2 -1 • 1 hunk • 1 file • unified");
    expect(collapsed.lines[1]).toBe(
      `… (4 more diff lines • 1 more hunk • ${keyHint("app.tools.expand", "to expand")})`,
    );
    expect(renderTuiDiff({ diffData, width: 36, theme, expanded: false }).lines.at(-1)).toMatch(/^… \(/);
    expect(renderTuiDiff({ diffData, width: 8, theme, expanded: false }).lines.at(-1)).toBe("…");
  });

  it("wraps long diff rows with hanging indent instead of truncating with ellipsis", () => {
    const longText = "the quick brown fox jumps over the lazy dog and keeps going far past the right edge";
    const longDiffData: DiffData = {
      version: 1,
      entries: [
        { kind: "remove", oldLine: 1, text: longText },
        { kind: "add", newLine: 1, text: longText.toUpperCase() },
        { kind: "context", oldLine: 2, newLine: 2, text: "tail" },
      ],
      stats: { added: 1, removed: 1, context: 1 },
      blockRanges: [{ kind: "add", startLine: 1, endLine: 2 }],
    };
    const width = 60;
    const out = renderTuiDiff({ diffData: longDiffData, width, theme: identityTheme, expanded: true });
    expect(out.mode).toBe("unified");
    for (const line of out.lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    expect(out.lines.some((line) => line.endsWith("..."))).toBe(false);
    const removeIdx = out.lines.findIndex((line) => line.startsWith("▌- 1 │ "));
    expect(removeIdx).toBeGreaterThanOrEqual(0);
    const indent = " ".repeat(visibleWidth("▌- 1 │ "));
    expect(out.lines[removeIdx + 1]?.startsWith(indent)).toBe(true);
    const reassembled = [out.lines[removeIdx]!.slice(visibleWidth("▌- 1 │ "))];
    let cursor = removeIdx + 1;
    while (cursor < out.lines.length && out.lines[cursor]!.startsWith(indent) && !out.lines[cursor]!.startsWith("▌")) {
      reassembled.push(out.lines[cursor]!.slice(indent.length));
      cursor++;
    }
    const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(collapse(reassembled.join(" "))).toBe(collapse(longText));
  });

  it("falls back to unified mode for pure-add diffs even when the pane is wide enough for split", () => {
    const pureAdd: DiffData = {
      version: 1,
      entries: [
        { kind: "add", newLine: 1, text: "first added line" },
        { kind: "add", newLine: 2, text: "second added line" },
        { kind: "add", newLine: 3, text: "third added line" },
      ],
      stats: { added: 3, removed: 0, context: 0 },
      blockRanges: [{ kind: "add", startLine: 1, endLine: 3 }],
    };
    const out = renderTuiDiff({ diffData: pureAdd, width: 160, theme: identityTheme, expanded: true });
    expect(out.mode).toBe("unified");
    const text = out.lines.join("\n");
    expect(text).toContain("▌+ 1 │ first added line");
    expect(text).not.toMatch(/^old\s+│ new$/m);
  });

  it("split mode tints add/remove/context rows on both panes", () => {
    const colorTheme = {
      fg: (kind: string, text: string) => `<${kind}>${text}</${kind}>`,
      bold: (text: string) => text,
    } as any;
    const out = renderTuiDiff({ diffData: markerDiffData, width: 140, theme: colorTheme, expanded: true });
    expect(out.mode).toBe("split");
    const text = out.lines.join("\n");
    // remove row appears tinted on the left pane
    expect(text).toMatch(/<error>[^<]*▌- 1 │ one[^<]*<\/error>/);
    // add row appears tinted on the right pane
    expect(text).toMatch(/<success>[^<]*▌\+ 1 │ ONE[^<]*<\/success>/);
    // context row is tinted with toolOutput on both sides
    const contextMatches = text.match(/<toolOutput>[^<]*▌\s{2}2 │ two[^<]*<\/toolOutput>/g) ?? [];
    expect(contextMatches.length).toBeGreaterThanOrEqual(2);
  });
});

it("updates collapsed diff hints when the active host shortcut changes", () => {
  const previous = hostTui.getKeybindings();
  const bindings = new HostKeybindingsManager();
  hostTui.setKeybindings(bindings);
  try {
    const defaultHint = keyHint("app.tools.expand", "to expand");
    const first = renderTuiDiff({ diffData, width: 120, theme, expanded: false });
    bindings.setUserBindings({ "app.tools.expand": ["ctrl+shift+alt+x", "ctrl+alt+enter"] });
    const customHint = keyHint("app.tools.expand", "to expand");
    const second = renderTuiDiff({ diffData, width: 120, theme, expanded: false });
    assert.ok(plain(second.lines[1] ?? "").includes(plain(customHint)),
      "collapsed diff uses a stale expansion shortcut");
    assert.equal(first.lines[1], `… (4 more diff lines • 1 more hunk • ${defaultHint})`);
    assert.equal(plain(defaultHint), "ctrl+o to expand");
    assert.equal(second.lines[1], `… (4 more diff lines • 1 more hunk • ${customHint})`);
    assert.notEqual(plain(second.lines[1]), plain(first.lines[1]));
    assert.equal(second.lines.length, 2);
    assert.ok(!second.lines.join("\n").includes("▌+"));
    for (const config of [{}, { "app.tools.expand": ["ctrl+shift+alt+x", "ctrl+alt+enter"] }]) {
      bindings.setUserBindings(config);
      for (const width of [8, 24, 36, 80, 120, 200]) {
        for (const expanded of [false, true]) {
          const out = renderTuiDiff({ diffData, width, theme, expanded });
          assert.ok(out.lines.every(line => visibleWidth(line) <= width));
        }
      }
      assert.equal(renderTuiDiff({ diffData, width: 36, theme, expanded: false }).lines[1],
        "… (4 more lines • 1 hunks)");
      assert.equal(renderTuiDiff({ diffData, width: 8, theme, expanded: false }).lines[1], "…");
      const expanded = renderTuiDiff({ diffData, width: 80, theme, expanded: true });
      assert.ok(expanded.lines.join("\n").includes("▌+ 2 │ TWO"));
      assert.ok(!expanded.lines.some(line => plain(line).includes("to expand")));
    }
  } finally {
    hostTui.setKeybindings(previous);
  }
});

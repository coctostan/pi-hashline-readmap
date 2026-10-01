import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { getExpandHint, buildCollapsedPreview } from "../src/tui-render-utils.js";
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

describe("buildCollapsedPreview", () => {
  it("returns the last N lines with an earlier-lines hint when content exceeds N", () => {
    const body = ["one", "two", "three", "four", "five", "six", "seven"].join("\n");
    const preview = buildCollapsedPreview(body, 5, 80);
    expect(preview.lines).toEqual(["three", "four", "five", "six", "seven"]);
    expect(preview.hint).toBe(`… (2 earlier lines${getExpandHint()})`);
  });

  it("shows all lines with no hint when content is within N", () => {
    const preview = buildCollapsedPreview("a\nb", 5, 80);
    expect(preview.lines).toEqual(["a", "b"]);
    expect(preview.hint).toBeNull();
  });

  it("uses singular 'line' when exactly one earlier line is hidden", () => {
    const body = ["1", "2", "3", "4", "5", "6"].join("\n");
    const preview = buildCollapsedPreview(body, 5, 80);
    expect(preview.hint).toBe(`… (1 earlier line${getExpandHint()})`);
  });

  it("returns nothing when previewLines is 0", () => {
    const preview = buildCollapsedPreview("a\nb", 0, 80);
    expect(preview.lines).toEqual([]);
    expect(preview.hint).toBeNull();
  });

  it("returns nothing for blank bodies", () => {
    const preview = buildCollapsedPreview("\n\n", 5, 80);
    expect(preview.lines).toEqual([]);
    expect(preview.hint).toBeNull();
  });

  it("width-clamps preview lines", () => {
    const long = "x".repeat(200);
    const preview = buildCollapsedPreview(long, 5, 20);
    expect(preview.lines.every((l) => visibleWidth(l) <= 20)).toBe(true);
  });

  it("preserves hashline formatting when the hashlines option is set", () => {
    const preview = buildCollapsedPreview("1:abc|hello", 5, 80, { hashlines: true });
    expect(preview.lines[0]).toContain("1:abc|");
  });
});

it("clamps collapsed preview hints for default and longer host shortcuts", () => {
  const previous = hostTui.getKeybindings();
  const bindings = new HostKeybindingsManager();
  hostTui.setKeybindings(bindings);
  try {
    for (const config of [{}, { "app.tools.expand": ["ctrl+shift+alt+x", "ctrl+alt+enter"] }]) {
      bindings.setUserBindings(config);
      for (const width of [8, 24, 40, 80, 200]) {
        const preview = buildCollapsedPreview("one\ntwo\nthree", 1, width);
        assert.ok(visibleWidth(preview.hint ?? "") <= width, "collapsed preview hint exceeds viewport");
        assert.ok(preview.lines.every(line => visibleWidth(line) <= width));
        assert.deepEqual(preview.lines, ["three"]);
        if (width === 200) {
          assert.equal(preview.hint, `… (2 earlier lines • ${keyHint("app.tools.expand", "to expand")})`);
        }
      }
    }
    assert.deepEqual(buildCollapsedPreview("one", 1, 8), { hint: null, lines: ["one"] });
    assert.deepEqual(buildCollapsedPreview("one\ntwo", 0, 8), { hint: null, lines: [] });
  } finally {
    hostTui.setKeybindings(previous);
  }
});

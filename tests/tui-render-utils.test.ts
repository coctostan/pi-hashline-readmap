import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resetCapabilitiesCache, setCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { stripVTControlCharacters as plain } from "node:util";
import { vi } from "vitest";
import { initTheme, keyHint } from "@earendil-works/pi-coding-agent";
import {
  getExpandHint,
  appendExpandHint,
  buildCollapsedPreview,
  clampLinesToWidth,
  isRendererExpanded,
  linkToolPath,
  renderToolLabel,
  summaryLine,
  wrapLinesToWidth,
} from "../src/tui-render-utils.js";

vi.unmock("@earendil-works/pi-coding-agent");
initTheme("dark", false);

const hostEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const hostTui = await import(pathToFileURL(
  createRequire(hostEntry).resolve("@earendil-works/pi-tui")
).href);
const { KeybindingsManager: HostKeybindingsManager } = await import(
  new URL("./core/keybindings.js", hostEntry).href
);

const theme = {
  fg: (_style: string, text: string) => text,
  bold: (text: string) => `**${text}**`,
};

afterEach(() => {
  resetCapabilitiesCache();
});

describe("shared TUI renderer utilities", () => {
  it("renders plain bold labels and summary hints consistently", () => {
    expect(renderToolLabel(theme, "read")).toBe("**read**");
    expect(summaryLine("loaded 2 lines", { hidden: true })).toBe(`↳ loaded 2 lines${getExpandHint()}`);
    expect(summaryLine("command completed (no output)", { hidden: false })).toBe("↳ command completed (no output)");
    expect(appendExpandHint("↳ loaded", true)).toBe(`↳ loaded${getExpandHint()}`);
    expect(appendExpandHint("↳ loaded", false)).toBe("↳ loaded");
  });

  it("accepts both options.expanded and context.expanded", () => {
    expect(isRendererExpanded({ expanded: true })).toBe(true);
    expect(isRendererExpanded({}, { expanded: true })).toBe(true);
    expect(isRendererExpanded({ expanded: false }, { expanded: true })).toBe(true);
    expect(isRendererExpanded(undefined, undefined)).toBe(false);
  });

  it("wraps tool paths in OSC 8 hyperlinks only when supported", () => {
    const cwd = resolve("/tmp/pi-hashline-link-root");
    const rawPath = "src/read.ts";
    const styledText = "src/read.ts";
    const expectedUrl = pathToFileURL(resolve(cwd, rawPath)).href;

    setCapabilities({ images: null, trueColor: true, hyperlinks: true });
    const linked = linkToolPath(styledText, rawPath, cwd);
    expect(linked).toContain("\u001b]8;;file:///");
    expect(linked).toContain(`\u001b]8;;${expectedUrl}\u001b\\`);
    expect(linked).toContain(`src/read.ts\u001b]8;;\u001b\\`);

    setCapabilities({ images: null, trueColor: true, hyperlinks: false });
    expect(linkToolPath(styledText, rawPath, cwd)).toBe(styledText);
  });

  it("clamps and wraps every line using visible terminal width", () => {
    const clamped = clampLinesToWidth(["abcdef", "wide 字字字"], 5);
    expect(clamped.every((line) => visibleWidth(line) <= 5)).toBe(true);

    const wrapped = wrapLinesToWidth(["abcdef", "ghijkl"], 4);
    expect(wrapped).toEqual(["abcd", "ef", "ghij", "kl"]);
    expect(wrapped.every((line) => visibleWidth(line) <= 4)).toBe(true);
  });


  it("uses pi-tui wrapping helpers instead of hand-rolled ANSI wrapping", () => {
    const source = readFileSync(new URL("../src/tui-render-utils.ts", import.meta.url), "utf8");
    expect(source).not.toContain("hardWrapTextWithAnsi");
    expect(source).not.toContain("ANSI_RE");
  });
});

it("resolves shared expansion hints from the active host binding on each render", () => {
  const previous = hostTui.getKeybindings();
  const bindings = new HostKeybindingsManager();
  hostTui.setKeybindings(bindings);
  try {
    const defaultHint = keyHint("app.tools.expand", "to expand");
    const defaultSummary = summaryLine("loaded", { hidden: true });
    const defaultPreview = buildCollapsedPreview("one\ntwo\nthree", 1, 200);
    bindings.setUserBindings({ "app.tools.expand": "ctrl+shift+alt+x" });
    const customHint = keyHint("app.tools.expand", "to expand");
    const customSummary = summaryLine("loaded", { hidden: true });
    assert.equal(plain(customSummary), "↳ loaded • " + plain(customHint));
    assert.notEqual(plain(customSummary), plain(defaultSummary));
    assert.equal(defaultSummary, "↳ loaded • " + defaultHint);
    assert.equal(plain(defaultHint), "ctrl+o to expand");
    assert.equal(defaultPreview.hint, `… (2 earlier lines • ${defaultHint})`);
    assert.deepEqual(defaultPreview.lines, ["three"]);
    const customPreview = buildCollapsedPreview("one\ntwo\nthree", 1, 200);
    assert.equal(customPreview.hint, `… (2 earlier lines • ${customHint})`);
    assert.deepEqual(customPreview.lines, defaultPreview.lines);
    assert.equal(summaryLine("loaded", { hidden: false }), "↳ loaded");
    assert.equal(buildCollapsedPreview("one", 1, 200).hint, null);
    assert.deepEqual(buildCollapsedPreview("one\ntwo", 0, 200), { hint: null, lines: [] });
    for (const text of [defaultSummary, customSummary]) {
      for (const width of [8, 24, 80, 200]) {
        assert.ok(clampLinesToWidth([text], width).every(line => visibleWidth(line) <= width));
      }
    }
  } finally {
    hostTui.setKeybindings(previous);
  }
});

it("omits unavailable expansion shortcuts while preserving preview counts", () => {
  const previous = hostTui.getKeybindings();
  const bindings = new HostKeybindingsManager();
  hostTui.setKeybindings(bindings);
  try {
    for (const disabled of [[], ""] as const) {
      bindings.setUserBindings({ "app.tools.expand": disabled });
      assert.equal(getExpandHint(), "");
      assert.equal(summaryLine("loaded", { hidden: true }), "↳ loaded");
      const preview = buildCollapsedPreview("one\ntwo\nthree", 1, 200);
      assert.equal(preview.hint, "… (2 earlier lines)");
      assert.deepEqual(preview.lines, ["three"]);
    }
    bindings.setUserBindings({});
    assert.equal(plain(getExpandHint()), " • ctrl+o to expand");
  } finally {
    hostTui.setKeybindings(previous);
  }
});

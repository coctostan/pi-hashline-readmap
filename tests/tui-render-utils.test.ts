import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resetCapabilitiesCache, setCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import {
  EXPAND_HINT,
  appendExpandHint,
  clampLinesToWidth,
  isRendererExpanded,
  linkToolPath,
  renderToolLabel,
  summaryLine,
  wrapLinesToWidth,
} from "../src/tui-render-utils.js";

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
    expect(summaryLine("loaded 2 lines", { hidden: true })).toBe(`↳ loaded 2 lines${EXPAND_HINT}`);
    expect(summaryLine("command completed (no output)", { hidden: false })).toBe("↳ command completed (no output)");
    expect(appendExpandHint("↳ loaded", true)).toBe(`↳ loaded${EXPAND_HINT}`);
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

import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { EXPAND_HINT, buildCollapsedPreview } from "../src/tui-render-utils.js";

describe("buildCollapsedPreview", () => {
  it("returns the last N lines with an earlier-lines hint when content exceeds N", () => {
    const body = ["one", "two", "three", "four", "five", "six", "seven"].join("\n");
    const preview = buildCollapsedPreview(body, 5, 80);
    expect(preview.lines).toEqual(["three", "four", "five", "six", "seven"]);
    expect(preview.hint).toBe(`… (2 earlier lines${EXPAND_HINT})`);
  });

  it("shows all lines with no hint when content is within N", () => {
    const preview = buildCollapsedPreview("a\nb", 5, 80);
    expect(preview.lines).toEqual(["a", "b"]);
    expect(preview.hint).toBeNull();
  });

  it("uses singular 'line' when exactly one earlier line is hidden", () => {
    const body = ["1", "2", "3", "4", "5", "6"].join("\n");
    const preview = buildCollapsedPreview(body, 5, 80);
    expect(preview.hint).toBe(`… (1 earlier line${EXPAND_HINT})`);
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

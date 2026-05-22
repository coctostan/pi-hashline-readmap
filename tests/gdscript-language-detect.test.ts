import { describe, expect, it } from "vitest";
import { detectLanguage, getSupportedExtensions, isSupported } from "../src/readmap/language-detect.js";

describe("GDScript language detection", () => {
  it("detects .gd paths as GDScript", () => {
    expect(detectLanguage("Player.gd")).toEqual({ id: "gdscript", name: "GDScript" });
    expect(detectLanguage("res://scripts/player.GD")).toEqual({ id: "gdscript", name: "GDScript" });
    expect(isSupported("addons/example/plugin.gd")).toBe(true);
    expect(getSupportedExtensions()).toContain(".gd");
  });
});

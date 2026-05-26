import { describe, it, expect } from "vitest";
import { HASHLINE_TOOL_PTC_POLICY } from "../src/ptc-tool-policy.js";

describe("HASHLINE_TOOL_PTC_POLICY write entry", () => {
  it("includes a write entry classified as mutating / not-safe-by-default", () => {
    expect(Object.keys(HASHLINE_TOOL_PTC_POLICY.tools)).toContain("write");
    expect(HASHLINE_TOOL_PTC_POLICY.tools.write).toEqual({
      toolName: "write",
      helperName: "write",
      overridesBuiltin: true,
      mutability: "mutating",
      defaultExposure: "not-safe-by-default",
    });
  });
});

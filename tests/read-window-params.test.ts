import { describe, expect, it } from "vitest";
import { parseWindowParams } from "../src/read-window.js";

describe("parseWindowParams", () => {
  it("is inactive when neither param is supplied", () => {
    expect(parseWindowParams({})).toEqual({ ok: true, window: null, adjustments: [] });
  });

  it("treats an explicit charOffset of 0 as a real value, not an omitted placeholder", () => {
    expect(parseWindowParams({ charOffset: 0 })).toEqual({
      ok: true, window: { charOffset: 0, charLimit: 500, charLimitSupplied: false }, adjustments: [],
    });
    expect(parseWindowParams({ charOffset: "0" })).toMatchObject({ ok: true, window: { charOffset: 0 } });
  });

  it("defaults charOffset to 0 when only charLimit is supplied", () => {
    expect(parseWindowParams({ charLimit: 100 })).toEqual({
      ok: true, window: { charOffset: 0, charLimit: 100, charLimitSupplied: true }, adjustments: [],
    });
  });

  it("accepts obvious base-10 strings", () => {
    expect(parseWindowParams({ charOffset: "250", charLimit: "1000" })).toEqual({
      ok: true, window: { charOffset: 250, charLimit: 1000, charLimitSupplied: true }, adjustments: [],
    });
  });

  it("ignores empty strings with an adjustment note and stays inactive", () => {
    expect(parseWindowParams({ charOffset: "", charLimit: "" })).toEqual({
      ok: true, window: null, adjustments: ["ignored empty charOffset", "ignored empty charLimit"],
    });
  });

  it("clamps charLimit above 10,000 and reports it", () => {
    expect(parseWindowParams({ charOffset: 0, charLimit: 50_000 })).toEqual({
      ok: true,
      window: { charOffset: 0, charLimit: 10_000, charLimitSupplied: true },
      adjustments: ["clamped charLimit 50000 to 10000"],
    });
  });

  it.each([
    [{ charOffset: -1 }, "invalid-char-offset", "Invalid charOffset: expected a non-negative integer, received -1."],
    [{ charOffset: 1.5 }, "invalid-char-offset", "Invalid charOffset: expected a base-10 integer, received 1.5."],
    [{ charOffset: "abc" }, "invalid-char-offset", 'Invalid charOffset: expected a base-10 integer, received "abc".'],
    [{ charOffset: true }, "invalid-char-offset", "Invalid charOffset: expected a base-10 integer, received true."],
    [{ charLimit: 0 }, "invalid-char-limit", "Invalid charLimit: expected a positive integer, received 0."],
    [{ charLimit: -5 }, "invalid-char-limit", "Invalid charLimit: expected a positive integer, received -5."],
    [{ charLimit: 2.5 }, "invalid-char-limit", "Invalid charLimit: expected a base-10 integer, received 2.5."],
    [{ charLimit: "x" }, "invalid-char-limit", 'Invalid charLimit: expected a base-10 integer, received "x".'],
  ])("rejects %j", (input, code, message) => {
    expect(parseWindowParams(input)).toEqual({ ok: false, code, message });
  });
});

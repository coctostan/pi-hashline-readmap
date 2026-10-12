import { describe, expect, it } from "vitest";
import { buildReadRehydrateDescriptor } from "../src/context-hygiene.js";

describe("read rehydrate descriptors — long-line windows", () => {
  it("keeps charOffset (including 0) and charLimit when supplied", () => {
    expect(buildReadRehydrateDescriptor({ path: "a.ts", offset: 2, charOffset: 0 })).toEqual({
      tool: "read",
      input: { path: "a.ts", offset: 2, charOffset: 0 },
    });
    expect(buildReadRehydrateDescriptor({ path: "a.ts", offset: 2, charOffset: 500, charLimit: 1000 })).toEqual({
      tool: "read",
      input: { path: "a.ts", offset: 2, charOffset: 500, charLimit: 1000 },
    });
  });

  it("leaves descriptors without char params exactly as before", () => {
    expect(buildReadRehydrateDescriptor({ path: "a.ts", offset: 2 })).toEqual({
      tool: "read",
      input: { path: "a.ts", offset: 2 },
    });
  });
});

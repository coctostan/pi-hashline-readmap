import { describe, expect, it } from "vitest";
import { createReadFreshness } from "../src/read-freshness.js";

describe("read freshness", () => {
  it("keeps a noted file fresh until that file is expired", () => {
    const freshness = createReadFreshness();
    expect(freshness.has("/repo/a.ts")).toBe(false);
    freshness.note("/repo/a.ts");
    freshness.note("/repo/a.ts");
    expect(freshness.has("/repo/a.ts")).toBe(true);
    freshness.expirePath("/repo/a.ts");
    expect(freshness.has("/repo/a.ts")).toBe(false);
  });

  it("keys paths the way context hygiene normalizes them", () => {
    const freshness = createReadFreshness();
    freshness.note("C:\\repo\\a.ts");
    expect(freshness.has("C:/repo/a.ts")).toBe(true);
    freshness.expirePath("C:/repo/a.ts");
    expect(freshness.has("C:\\repo\\a.ts")).toBe(false);
  });

  it("expires only the path it names", () => {
    const freshness = createReadFreshness();
    freshness.note("/repo/a.ts");
    freshness.note("C:\\repo\\b.ts");
    freshness.expirePath("/repo/a.ts");
    freshness.expirePath("/repo/never-noted.ts");
    expect(freshness.has("/repo/a.ts")).toBe(false);
    expect(freshness.has("C:\\repo\\b.ts")).toBe(true);
  });
});

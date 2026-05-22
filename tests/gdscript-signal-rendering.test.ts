import { describe, expect, it } from "vitest";
import { formatFileMap } from "../src/readmap/formatter.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";

describe("GDScript signal symbol rendering", () => {
  it("renders signal symbols through the generic symbol formatter", () => {
    expect(SymbolKind.Signal).toBe("signal");

    const rendered = formatFileMap({
      path: "/tmp/Player.gd",
      totalLines: 4,
      totalBytes: 64,
      language: "GDScript",
      symbols: [
        { name: "health_changed", kind: SymbolKind.Signal, startLine: 2, endLine: 2 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    expect(rendered).toContain("health_changed: [2]");
    expect(rendered).not.toContain("undefined");
  });
});

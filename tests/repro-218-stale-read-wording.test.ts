import { describe, it, expect } from "vitest";
import {
  renderStaleReadPlaceholder,
  renderStaleGrepPlaceholder,
  renderStaleAstSearchPlaceholder,
} from "../src/context-hygiene.js";

describe("issue 218 — stale placeholders clarify that content-hash edits still validate", () => {
  it("read placeholder explains hash-validated edits are not blocked", () => {
    const msg = renderStaleReadPlaceholder();
    expect(msg.toLowerCase()).toContain("content-derived");
    expect(msg.toLowerCase()).toContain("hash");
    expect(msg.toLowerCase()).toContain("still applies");
    // Keep the existing reassurance + rehydration guidance.
    expect(msg).toContain("Stale read result");
    expect(msg.toLowerCase()).toContain("nothing is wrong with read");
  });

  it("grep placeholder explains hash-validated edits are not blocked", () => {
    const msg = renderStaleGrepPlaceholder();
    expect(msg.toLowerCase()).toContain("content-derived");
    expect(msg.toLowerCase()).toContain("still applies");
    expect(msg).toContain("Stale grep result");
  });

  it("ast_search placeholder explains hash-validated edits are not blocked", () => {
    const msg = renderStaleAstSearchPlaceholder();
    expect(msg.toLowerCase()).toContain("content-derived");
    expect(msg.toLowerCase()).toContain("still applies");
    expect(msg).toContain("Stale ast_search result");
  });
});

import { describe, it, expect } from "vitest";
import { filterBashOutput } from "../src/rtk/bash-filter.js";

describe("filterBashOutput", () => {
  it("handles empty output, ANSI stripping, and fallback", () => {
    // AC3
    expect(filterBashOutput("echo hello", "")).toEqual({ output: "", savedChars: 0 });

    // AC2 + AC15
    const ansiOutput = "\x1b[32m✓ test passed\x1b[0m";
    const result = filterBashOutput("echo hello", ansiOutput);
    expect(result.output).toBe("✓ test passed");
    expect(result.output).not.toContain("\x1b");

    // AC1 shape + AC5 savedChars
    expect(typeof result.output).toBe("string");
    expect(typeof result.savedChars).toBe("number");
    expect(result.savedChars).toBe(ansiOutput.length - result.output.length);
  });
});

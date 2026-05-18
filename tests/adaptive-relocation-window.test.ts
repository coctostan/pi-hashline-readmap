import { describe, it, expect, beforeAll } from "vitest";
import { computeLineHash, applyHashlineEdits } from "../src/hashline.js";

describe("adaptive relocation window", () => {
  beforeAll(async () => {
  });

  it("single edit uses base window of ±20 — relocation at 21 lines fails", () => {
    // Build a 60-line file where line 30 has unique content
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(`line ${i + 1} content`);
    }

    // Compute hash for line 30
    const hash30 = computeLineHash(30, lines[29]);

    // Try to use anchor 30:hash but content is actually at line 51 (21 lines away)
    // This should FAIL for single edit — base window is 20
    const movedLines = [...lines];
    // Move line 30's content to line 51
    movedLines[29] = "replaced line 30";
    movedLines[50] = lines[29]; // put original at line 51
    const movedContent = movedLines.join("\n");

    expect(() =>
      applyHashlineEdits(movedContent, [
        { set_line: { anchor: `30:${hash30}`, new_text: "edited" } },
      ])
    ).toThrow(/changed since last read/);
  });

  it("multi-edit batch expands window — relocation at 25 lines succeeds with 5 edits", () => {
    // Build a 100-line file
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`unique line ${i + 1} with distinct content ${i * 7}`);
    }

    // Compute hash for line 50
    const hash50 = computeLineHash(50, lines[49]);

    // Move line 50's content to line 75 (25 lines away)
    const movedLines = [...lines];
    movedLines[49] = "replaced line 50";
    movedLines[74] = lines[49]; // put original at line 75
    const movedContent = movedLines.join("\n");

    // With 5 edits: window = max(20, 5*5) = 25, which should reach line 75
    const result = applyHashlineEdits(movedContent, [
      { set_line: { anchor: `50:${hash50}`, new_text: "edited line 50" } },
      { set_line: { anchor: `1:${computeLineHash(1, lines[0])}`, new_text: lines[0] } }, // noop
      { set_line: { anchor: `2:${computeLineHash(2, lines[1])}`, new_text: lines[1] } }, // noop
      { set_line: { anchor: `3:${computeLineHash(3, lines[2])}`, new_text: lines[2] } }, // noop
      { set_line: { anchor: `4:${computeLineHash(4, lines[3])}`, new_text: lines[3] } }, // noop
    ]);

    // The edit should succeed — line 50's content was found at line 75 within the expanded window
    expect(result.content).toContain("edited line 50");
    // Should have a relocation warning
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes("Auto-relocated"))).toBe(true);
  });

  it("adaptive window is capped at 100", () => {
    // Build a 300-line file
    const lines: string[] = [];
    for (let i = 0; i < 300; i++) {
      lines.push(`unique line ${i + 1} with distinct content ${i * 13}`);
    }

    // Compute hash for line 100
    const hash100 = computeLineHash(100, lines[99]);

    // Move line 100's content to line 210 (110 lines away — beyond cap of 100)
    const movedLines = [...lines];
    movedLines[99] = "replaced line 100";
    movedLines[209] = lines[99]; // put original at line 210
    const movedContent = movedLines.join("\n");

    // Even with 25 edits (window = max(20, 25*5) = min(125, 100) = 100), 110 lines is beyond cap
    const edits: any[] = [
      { set_line: { anchor: `100:${hash100}`, new_text: "edited" } },
    ];
    for (let i = 0; i < 24; i++) {
      const ln = i + 1;
      edits.push({ set_line: { anchor: `${ln}:${computeLineHash(ln, lines[ln - 1])}`, new_text: lines[ln - 1] } });
    }

    expect(() => applyHashlineEdits(movedContent, edits)).toThrow(/changed since last read/);
  });

  it("mismatch error reports the actual window size", () => {
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(`line ${i + 1}`);
    }

    const hash30 = computeLineHash(30, lines[29]);
    const movedLines = [...lines];
    movedLines[29] = "replaced";
    const movedContent = movedLines.join("\n");

    // 5 edits → window = 25
    const edits: any[] = [
      { set_line: { anchor: `30:${hash30}`, new_text: "edited" } },
    ];
    for (let i = 0; i < 4; i++) {
      const ln = i + 1;
      edits.push({ set_line: { anchor: `${ln}:${computeLineHash(ln, lines[ln - 1])}`, new_text: lines[ln - 1] } });
    }

    try {
      applyHashlineEdits(movedContent, edits);
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("±25");
    }
  });
});

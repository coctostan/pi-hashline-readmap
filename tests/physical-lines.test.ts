import { expect, it } from "vitest";

it("projects logical splices without changing untouched physical boundaries", async () => {
  const path = "../src/physical-lines.js";
  const module: any = await import(path).catch(() => ({}));
  expect(typeof module.PhysicalLineBuffer === "function").toBe(true);
  const fixtures = [
    { input: "alpha\nbeta\r\ngamma\n", index: 0, count: 1, rows: ["ALPHA"], output: "ALPHA\nbeta\r\ngamma\n" },
    { input: "a\r\nb\nc", index: 1, count: 1, rows: ["B", "C"], output: "a\r\nB\nC\nc" },
    { input: "a\nb\r\nc\n", index: 1, count: 0, rows: ["X", "Y"], output: "a\nX\nY\nb\r\nc\n" },
    { input: "a\nb\r\nc\n", index: 1, count: 1, rows: [], output: "a\nc\n" },
    { input: "a\nb", index: 1, count: 1, rows: [], output: "a" },
    { input: "a", index: 1, count: 0, rows: ["B"], output: "a\nB" },
    { input: "", index: 0, count: 1, rows: ["A", "B"], output: "A\nB" },
    { input: "a\r\n", index: 1, count: 0, rows: ["B"], output: "a\r\nB\r\n" },
    { input: "a\nb\r\n", index: 1, count: 0, rows: ["X", "Y"], endings: ["\r\n", "\r\n"], output: "a\nX\r\nY\nb\r\n" },
    { input: "same\nsame\r\nsame\n", index: 1, count: 1, rows: ["NEW"], output: "same\nNEW\r\nsame\n" },
  ];
  for (const fixture of fixtures) {
    const buffer = new module.PhysicalLineBuffer(fixture.input);
    expect(buffer.toString() === fixture.input).toBe(true);
    buffer.splice(fixture.index, fixture.count, fixture.rows, fixture.endings);
    expect(buffer.toString() === fixture.output).toBe(true);
  }
});

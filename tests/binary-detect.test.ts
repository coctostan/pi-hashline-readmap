import { describe, it, expect } from "vitest";
import { looksLikeBinary } from "../src/binary-detect.js";

describe("looksLikeBinary", () => {
  it("returns true for a buffer containing a NUL byte", () => {
    // "hello\0wo" — classic NUL-containing binary
    const buf = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f]);
    expect(looksLikeBinary(buf)).toBe(true);
  });

  it("returns true for NUL-free buffer with invalid UTF-8 high-bit bytes", () => {
    // sample.bin: 83 c8 1d 9f 5f 12 1c 26 38 e8 95 05 63 dc 68 b1
    // 0x83 is a bare continuation byte — invalid UTF-8, decodes to U+FFFD
    const buf = Buffer.from([
      0x83, 0xc8, 0x1d, 0x9f, 0x5f, 0x12, 0x1c, 0x26,
      0x38, 0xe8, 0x95, 0x05, 0x63, 0xdc, 0x68, 0xb1,
    ]);
    expect(looksLikeBinary(buf)).toBe(true);
  });

  it("returns true for high-bit-only bytes (0xf6–0xff, no NUL)", () => {
    // 10 bytes all above the valid UTF-8 scalar range
    const buf = Buffer.from(Array.from({ length: 10 }, (_, i) => 246 + i));
    expect(looksLikeBinary(buf)).toBe(true);
  });

  it("returns false for valid ASCII text", () => {
    const buf = Buffer.from("Hello, world!\nconst x = 1;");
    expect(looksLikeBinary(buf)).toBe(false);
  });

  it("returns false for valid multi-byte UTF-8 text", () => {
    // "café" in UTF-8: c3 a9 for é — valid 2-byte sequence
    const buf = Buffer.from("café 😊");
    expect(looksLikeBinary(buf)).toBe(false);
  });

  it("returns false for an empty buffer", () => {
    expect(looksLikeBinary(Buffer.alloc(0))).toBe(false);
  });

  it("returns false for valid UTF-8 that contains U+FFFD as real text", () => {
    // This is *valid* UTF-8. The replacement character U+FFFD is encoded as
    // the 3-byte sequence EF BF BD — perfectly valid. Must NOT be treated as binary.
    const buf = Buffer.from("hello \uFFFD world", "utf8");
    expect(looksLikeBinary(buf)).toBe(false);
  });
});

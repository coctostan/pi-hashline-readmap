/**
 * Returns true if the buffer appears to contain binary (non-text) content.
 *
 * Detection strategy:
 *   1. NUL byte (0x00) — universally indicates binary
 *   2. Invalid UTF-8 sequences — Node.js decodes them as U+FFFD replacement
 *      characters. To avoid false-positives on valid UTF-8 text that
 *      intentionally contains U+FFFD (encoded as EF BF BD), we do a round-trip
 *      check: if re-encoding the decoded string produces a different byte
 *      sequence, then U+FFFD was introduced by the decoder — not present in
 *      the original bytes as valid UTF-8.
 */
export function looksLikeBinary(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  // Fast path: NUL byte is a reliable binary marker
  if (buf.includes(0)) return true;
  const decoded = buf.toString("utf8");
  if (!decoded.includes("\uFFFD")) return false;

  // If U+FFFD came from invalid byte sequences, re-encoding will differ.
  return !Buffer.from(decoded, "utf8").equals(buf);
}

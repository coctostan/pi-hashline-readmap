import { expect, it } from "vitest";

import { computeKey } from "../src/persistent-map-cache.js";
import { MAPPER_VERSION } from "../src/readmap/mappers/json.js";

it("uses a new persistent-cache identity for source-backed JSON maps", () => {
  expect(MAPPER_VERSION).toBe(2);

  const versionOneKey = computeKey(
    "/tmp/example.json",
    1234,
    "content-hash",
    "json",
    1,
  );
  const currentKey = computeKey(
    "/tmp/example.json",
    1234,
    "content-hash",
    "json",
    MAPPER_VERSION,
  );

  expect(currentKey).not.toBe(versionOneKey);
});

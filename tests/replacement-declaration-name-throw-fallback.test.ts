import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  typescriptMapperFromContent: vi.fn(),
}));

vi.mock("../src/readmap/mappers/typescript.js", () => ({
  typescriptMapperFromContent: mocks.typescriptMapperFromContent,
}));

import { extractReplacementDeclarationName } from "../src/replacement-declaration-name.js";

const DECORATED_MEMBER = [
  "@trace()",
  "process<T>(value: T): T {",
  "  const normalized = value;",
  "  return normalized;",
  "}",
].join("\n");

beforeEach(() => {
  mocks.typescriptMapperFromContent.mockReset();
  mocks.typescriptMapperFromContent.mockRejectedValue(new Error("parser unavailable"));
});

it("falls back to the safe outer header when structural parsing throws", async () => {
  await expect(
    extractReplacementDeclarationName({
      filePath: "processor.ts",
      newBody: DECORATED_MEMBER,
      isMember: true,
    }),
  ).resolves.toBe("process");
});

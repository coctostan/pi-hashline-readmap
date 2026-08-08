import { afterAll, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sqlMapper } from "../src/readmap/mappers/sql.js";

const dirs: string[] = [];

async function fixture(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "issue-242-sql-"));
  dirs.push(dir);
  const filePath = join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

afterAll(async () => {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

it("maps a bare dollar-quoted function through its complete terminator", async () => {
  const filePath = await fixture(
    "function.sql",
    [
      "CREATE FUNCTION user_count() RETURNS INTEGER AS $$",
      "  SELECT COUNT(*) FROM users;",
      "$$ LANGUAGE SQL;",
    ].join("\n"),
  );
  const map = await sqlMapper(filePath);

  expect(map?.symbols).toContainEqual(
    expect.objectContaining({
      name: "FUNCTION user_count",
      startLine: 1,
      endLine: 3,
    }),
  );
});

import { afterAll, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sqlMapper } from "../src/readmap/mappers/sql.js";

const dirs: string[] = [];

async function fixture(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "issue-242-routines-"));
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

it("keeps inner routine statements inside procedure and trigger ranges", async () => {
  const cases = [
    {
      name: "trigger with inner statements",
      sql: [
        "CREATE TRIGGER audit_trigger",
        "AFTER INSERT ON users",
        "BEGIN",
        "  INSERT INTO audit_log(message) VALUES ('created; user');",
        "  UPDATE counters SET value = value + 1;",
        "END;",
      ].join("\n"),
      symbol: "TRIGGER audit_trigger",
      endLine: 6,
    },
    {
      name: "dollar-quoted procedure",
      sql: [
        "CREATE PROCEDURE refresh_users() AS $$",
        "BEGIN",
        "  PERFORM refresh_user(1);",
        "END;",
        "$$ LANGUAGE plpgsql;",
      ].join("\n"),
      symbol: "FUNCTION refresh_users",
      endLine: 5,
    },
  ];

  for (const testCase of cases) {
    const filePath = await fixture(`${testCase.name.replaceAll(" ", "-")}.sql`, testCase.sql);
    const map = await sqlMapper(filePath);
    const actual = map?.symbols.find((symbol) => symbol.name === testCase.symbol);
    if (actual?.endLine !== testCase.endLine) {
      throw new Error(
        `${testCase.name}: expected ${testCase.symbol} endLine ${testCase.endLine}, received ${actual?.endLine ?? "missing"}`,
      );
    }
  }
});

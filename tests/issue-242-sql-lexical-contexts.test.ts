import { afterAll, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sqlMapper } from "../src/readmap/mappers/sql.js";

const dirs: string[] = [];

async function fixture(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "issue-242-lexical-"));
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

it("ends mapped DDL only at top-level semicolons", async () => {
  const cases: Array<{
    name: string;
    sql: string;
    expected: Array<{ symbol: string; startLine: number; endLine: number }>;
  }> = [
    {
      name: "quoted and commented view",
      sql: [
        "CREATE VIEW punctuation_view AS",
        "  -- ignored ; line comment",
        "  SELECT ';' AS literal,",
        "         \"semi;identifier\" AS quoted_identifier",
        "  /* ignored ; block comment */ ;",
      ].join("\n"),
      expected: [{ symbol: "VIEW punctuation_view", startLine: 1, endLine: 5 }],
    },
    {
      name: "multiline table",
      sql: [
        "CREATE TABLE notes (",
        "  label text DEFAULT 'a;''b',",
        "  note text /* ignored ; */",
        ");",
      ].join("\n"),
      expected: [{ symbol: "TABLE notes", startLine: 1, endLine: 4 }],
    },
    {
      name: "ordinary mapped DDL forms",
      sql: [
        "CREATE INDEX users_name_idx ON users",
        "  (name);",
        "CREATE TYPE user_status AS",
        "  ENUM ('active', 'disabled');",
        "CREATE DOMAIN email_address AS",
        "  text CHECK (VALUE <> '');",
        "CREATE SCHEMA app",
        "  AUTHORIZATION app_owner;",
        "ALTER TABLE users",
        "  ADD COLUMN note text;",
      ].join("\n"),
      expected: [
        { symbol: "INDEX users_name_idx ON users", startLine: 1, endLine: 2 },
        { symbol: "TYPE user_status", startLine: 3, endLine: 4 },
        { symbol: "TYPE email_address", startLine: 5, endLine: 6 },
        { symbol: "SCHEMA app", startLine: 7, endLine: 8 },
        { symbol: "ALTER TABLE users", startLine: 9, endLine: 10 },
      ],
    },
    {
      name: "unterminated declaration before next declaration",
      sql: [
        "CREATE VIEW unfinished_view AS",
        "  SELECT 1",
        "CREATE TABLE bounded_table (id int);",
      ].join("\n"),
      expected: [
        { symbol: "VIEW unfinished_view", startLine: 1, endLine: 2 },
        { symbol: "TABLE bounded_table", startLine: 3, endLine: 3 },
      ],
    },
    {
      name: "unterminated declaration at file end",
      sql: ["CREATE VIEW eof_view AS", "  SELECT 1"].join("\n"),
      expected: [{ symbol: "VIEW eof_view", startLine: 1, endLine: 2 }],
    },
  ];

  for (const testCase of cases) {
    const filePath = await fixture(`${testCase.name.replaceAll(" ", "-")}.sql`, testCase.sql);
    const map = await sqlMapper(filePath);

    for (const expected of testCase.expected) {
      const actual = map?.symbols.find((symbol) => symbol.name === expected.symbol);
      if (
        !actual ||
        actual.startLine !== expected.startLine ||
        actual.endLine !== expected.endLine
      ) {
        const received = actual
          ? `${actual.startLine}-${actual.endLine}`
          : "missing";
        throw new Error(
          `${testCase.name}: expected ${expected.symbol} lines ${expected.startLine}-${expected.endLine}, received ${received}`,
        );
      }
    }
  }
});

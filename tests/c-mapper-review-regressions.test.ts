import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cMapper } from "../src/readmap/mappers/c.js";
import { formatFileMap } from "../src/readmap/formatter.js";

async function mapCSource(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "c-review-regressions-"));
  const file = join(dir, "review.c");
  try {
    await writeFile(file, source, "utf8");
    return await cMapper(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("C mapper review regressions", () => {
  it("extracts declarations from every conditional-preprocessor branch", async () => {
    const map = await mapCSource(
      "#ifdef FEATURE\nint guarded(void);\n#endif\n" +
        "#if PRIMARY\nint primary(void);\n#elif SECONDARY\nint secondary(void);\n#else\nint fallback(void);\n#endif\n" +
        "int visible(void);\n",
    );

    expect(map?.symbols.map((symbol) => symbol.name)).toEqual([
      "guarded",
      "primary",
      "secondary",
      "fallback",
      "visible",
    ]);
  });

  it("classifies every C declarator in source order", async () => {
    const map = await mapCSource(
      "int (*callback)(int);\n" +
        "int first(void), second(void);\n" +
        "int *returns_pointer(void);\n" +
        "int (*factory(void))(int);\n",
    );

    expect(map?.symbols.map(({ name, kind }) => [name, kind])).toEqual([
      ["callback", "variable"],
      ["first", "function"],
      ["second", "function"],
      ["returns_pointer", "function"],
      ["factory", "function"],
    ]);
  });

  it("preserves tagged typedef identities and renders aggregates without duplicate keywords", async () => {
    const map = await mapCSource(
      "typedef struct node { int value; } node_t;\n" +
        "enum status { STATUS_OK };\n",
    );

    expect(map?.symbols.map(({ name, kind }) => [name, kind])).toEqual([
      ["node", "class"],
      ["node_t", "class"],
      ["status", "enum"],
    ]);
    const rendered = formatFileMap(map!);
    expect(rendered).toContain("class node: [1]");
    expect(rendered).toContain("class node_t: [1]");
    expect(rendered).toContain("enum status: [2]");
    expect(rendered).not.toContain("class node_t: typedef struct node");
    expect(rendered).not.toContain("enum enum status");
  });


  it("does not emit duplicate aggregate symbols for tagged type references", async () => {
    const map = await mapCSource(
      "struct User;\n" +
        "struct User *current;\n" +
        "struct User *find_user(struct User *input);\n" +
        "enum State { READY };\n" +
        "enum State state;\n",
    );

    expect(map?.symbols.map(({ name, kind }) => [name, kind])).toEqual([
      ["User", "class"],
      ["current", "variable"],
      ["find_user", "function"],
      ["State", "enum"],
      ["state", "variable"],
    ]);
  });


  it("builds per-declarator signatures after an aggregate definition", async () => {
    const map = await mapCSource("struct Item { int value; } item, *item_ptr;\n");
    const variables = map!.symbols.filter((symbol) => symbol.kind === "variable");

    expect(variables.map(({ name, signature }) => [name, signature])).toEqual([
      ["item", "struct Item item"],
      ["item_ptr", "struct Item *item_ptr"],
    ]);
  });


  it("builds a distinct signature for every declarator", async () => {
    const map = await mapCSource("int a, *b, c(void);\n");
    expect(map!.symbols.map(({ name, signature }) => [name, signature])).toEqual([
      ["a", "int a"],
      ["b", "int *b"],
      ["c", "int c(void)"],
    ]);
  });


  it("preserves post-body aggregate attributes in variable signatures", async () => {
    const map = await mapCSource(
      "struct Packed { int value; } __attribute__((packed)) item, *item_ptr;\n",
    );
    const variables = map!.symbols.filter((symbol) => symbol.kind === "variable");

    expect(variables.map(({ name, signature }) => [name, signature])).toEqual([
      ["item", "struct Packed __attribute__((packed)) item"],
      ["item_ptr", "struct Packed __attribute__((packed)) *item_ptr"],
    ]);
  });
});

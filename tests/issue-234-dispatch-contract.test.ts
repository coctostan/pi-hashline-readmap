import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateMapWithIdentity } from "../src/readmap/mapper.js";

it("normalizes an empty dedicated FileMap into a fallback miss", async () => {
	const dir = await mkdtemp(join(tmpdir(), "issue-234-dispatch-"));
	const filePath = join(dir, "empty.jsonl");

	try {
		await writeFile(filePath, "", "utf8");

		await expect(generateMapWithIdentity(filePath)).resolves.toMatchObject({
			map: null,
			mapperName: "fallback",
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

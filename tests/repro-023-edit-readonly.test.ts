import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, chmodSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { wrapWriteError } from "../src/edit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Bug #023: edit readonly file -> permission denied", () => {
	const tmpDir = join(__dirname, ".tmp-023");
	const readonlyFile = join(tmpDir, "readonly.txt");
	beforeAll(() => {
		mkdirSync(tmpDir, { recursive: true });
		writeFileSync(readonlyFile, "line1\nline2\nline3\n", "utf-8");
		chmodSync(readonlyFile, 0o444);
	});
	afterAll(() => {
		try {
			chmodSync(readonlyFile, 0o644);
		} catch {}
		try {
			rmSync(tmpDir, { recursive: true });
		} catch {}
	});
	it("wrapWriteError maps EACCES to 'Permission denied: <path>'", () => {
		const eacces = new Error("EACCES: permission denied") as NodeJS.ErrnoException;
		eacces.code = "EACCES";
		expect(wrapWriteError(eacces, "foo.txt").message).toBe("Permission denied: foo.txt");
	});
	it("wrapWriteError maps EPERM to 'Permission denied: <path>'", () => {
		const eperm = new Error("EPERM: operation not permitted") as NodeJS.ErrnoException;
		eperm.code = "EPERM";
		expect(wrapWriteError(eperm, "bar.txt").message).toBe("Permission denied: bar.txt");
	});
	it("wrapWriteError re-throws other errors with generic message", () => {
		const eio = new Error("EIO: i/o error") as NodeJS.ErrnoException;
		eio.code = "EIO";
		expect(wrapWriteError(eio, "baz.txt").message).toBe("Failed to write file: baz.txt");
	});

	it("edit tool execute on chmod 444 file returns 'Permission denied: <path>'", async () => {
		const { registerEditTool } = await import("../src/edit.js");
		const { ensureHashInit, computeLineHash } = await import("../src/hashline.js");
		await ensureHashInit();
		let capturedTool: any = null;
		const mockPi = {
			registerTool(def: any) {
				capturedTool = def;
			},
		};
		registerEditTool(mockPi as any);
		if (!capturedTool) throw new Error("edit tool was not registered");

		const hash1 = computeLineHash(1, "line1");
		await expect(
			capturedTool.execute(
				"test-call",
				{
					path: readonlyFile,
					edits: [{ set_line: { anchor: `1:${hash1}`, new_text: "modified" } }],
				},
				new AbortController().signal,
				() => {},
				{ cwd: process.cwd() },
			),
		).rejects.toThrow(/Permission denied/);
	});
});

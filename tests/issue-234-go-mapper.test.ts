import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
}));

import { goMapper } from "../src/readmap/mappers/go.js";

it("normalizes null helper symbols into a quiet Go mapper miss", async () => {
	const dir = await mkdtemp(join(tmpdir(), "issue-234-go-unit-"));
	const filePath = join(dir, "empty.go");

	execFileMock.mockImplementation(
		(
			_command: string,
			args: string[],
			_options: unknown,
			callback: (
				error: Error | null,
				result: { stdout: string; stderr: string },
			) => void,
		) => {
			let stdout = "";
			if (args[0] === "version") {
				stdout = "go version go1.test test/arch\n";
			} else if (args[0] !== "build") {
				stdout = '{"package":"sample","symbols":null}\n';
			}
			callback(null, { stdout, stderr: "" });
			return {};
		},
	);

	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

	try {
		await writeFile(filePath, "package sample\n\n// comment only\n", "utf8");

		await expect(goMapper(filePath)).resolves.toBeNull();
		expect(errorSpy).not.toHaveBeenCalled();
	} finally {
		errorSpy.mockRestore();
		execFileMock.mockReset();
		await rm(dir, { recursive: true, force: true });
	}
});

it("emits an empty symbols array from the compiled Go helper", async () => {
	const childProcess = await vi.importActual<typeof import("node:child_process")>(
		"node:child_process",
	);
	const execFileAsync = promisify(childProcess.execFile);
	const scriptsDir = resolve(process.cwd(), "scripts");

	try {
		await execFileAsync("go", ["version"], { timeout: 5000 });
	} catch {
		// No Go toolchain on this machine — the helper source change cannot be
		// verified here; the mocked test above still pins the TypeScript contract.
		return;
	}

	const dir = await mkdtemp(join(tmpdir(), "issue-234-go-build-"));

	try {
		const filePath = join(dir, "empty.go");
		await writeFile(filePath, "package sample\n\n// comment only\n", "utf8");

		const helperBinary = join(dir, "go-outline");
		await execFileAsync(
			"go",
			["build", "-o", helperBinary, join(scriptsDir, "go_outline.go")],
			{ timeout: 30_000, cwd: scriptsDir },
		);

		const { stdout } = await execFileAsync(helperBinary, [filePath], {
			timeout: 10_000,
		});

		expect(JSON.parse(stdout)).toMatchObject({
			package: "sample",
			symbols: [],
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}, 60_000);

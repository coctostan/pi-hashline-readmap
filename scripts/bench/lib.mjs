/** Helpers shared by the scripts/bench harnesses: run headless Pi, summarize its event stream, run jobs in a pool. */
import { spawn } from "node:child_process";

export function runPi({ cwd, prompt, model, thinking, extensions, timeoutMs }) {
	const args = [
		"-p", "--mode", "json", "--no-session",
		"--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes", "--offline",
		...extensions.flatMap((path) => ["-e", path]),
		"--model", model, "--thinking", thinking,
		"--", prompt,
	];
	return new Promise((resolvePromise) => {
		const started = Date.now();
		// stdin must be closed: headless Pi otherwise waits for piped input.
		const child = spawn("pi", args, { cwd, env: { ...process.env, PI_OFFLINE: "1" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		child.stdout.on("data", (d) => (stdout += d));
		child.stderr.on("data", (d) => (stderr += d));
		const timer = setTimeout(() => {
			timedOut = true;
			try { process.kill(-child.pid, "SIGKILL"); } catch {}
		}, timeoutMs);
		child.on("close", (code) => {
			clearTimeout(timer);
			resolvePromise({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
		});
	});
}

export function summarizeEvents(stdout) {
	const summary = { toolCalls: {}, toolErrors: 0, turns: 0, tokens: 0, cost: 0, models: new Set(), errors: [] };
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		let event;
		try { event = JSON.parse(line); } catch { continue; }
		if (event.type === "tool_execution_start") summary.toolCalls[event.toolName] = (summary.toolCalls[event.toolName] ?? 0) + 1;
		else if (event.type === "tool_execution_end" && event.isError) summary.toolErrors++;
		else if (event.type === "turn_end") summary.turns++;
		else if (event.type === "message_end" && event.message?.role === "assistant") {
			const m = event.message;
			summary.tokens += m.usage?.totalTokens ?? 0;
			summary.cost += m.usage?.cost?.total ?? 0;
			if (m.provider && m.model) summary.models.add(`${m.provider}/${m.model}`);
			if (m.stopReason === "error" || m.errorMessage) summary.errors.push(m.errorMessage ?? "error");
		}
	}
	return { ...summary, models: [...summary.models] };
}

export async function pool(items, limit, worker) {
	let index = 0;
	const runners = Array.from({ length: Math.max(1, limit) }, async () => {
		while (index < items.length) {
			const item = items[index++];
			await worker(item);
		}
	});
	await Promise.all(runners);
}

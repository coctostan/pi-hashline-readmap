import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const benchModule: string = "../scripts/bench/explicit-edit.mjs";
const { summarizeEvents } = await import(benchModule);

// A real `pi --mode json` stream (Pi 1.5.0, openai-codex/gpt-6-luna, Explicit Edit task unique-1000-plain),
// with message_update events dropped and long strings and arrays trimmed.
const trace = readFileSync(new URL("./fixtures/bench/explicit-edit-trace.jsonl", import.meta.url), "utf8");

const line = (event: unknown) => JSON.stringify(event);

describe("summarizeEvents", () => {
	it("summarizes a real Pi event stream as the explicit-edit run recorded it", () => {
		const summary = summarizeEvents(trace);
		expect(summary).toEqual({
			toolCalls: { read: 1, grep: 1, edit: 1 },
			toolErrors: 0,
			turns: 4,
			tokens: 24704,
			cost: expect.closeTo(0.00127552, 10),
			models: ["openai-codex/gpt-6-luna"],
			errors: [],
		});
	});

	it("counts tool errors and provider errors, and skips blank and non-JSON lines", () => {
		const stream = [
			"",
			"not json",
			line({ type: "tool_execution_start", toolName: "bash" }),
			line({ type: "tool_execution_end", toolName: "bash", isError: true }),
			line({ type: "message_end", message: { role: "user", usage: { totalTokens: 99 } } }),
			line({ type: "message_end", message: { role: "assistant", provider: "p", model: "m", stopReason: "error", errorMessage: "rate limited", usage: { totalTokens: 10, cost: { total: 0.5 } } } }),
			line({ type: "message_end", message: { role: "assistant", provider: "p", model: "m", stopReason: "error" } }),
			line({ type: "turn_end" }),
		].join("\n");
		expect(summarizeEvents(stream)).toEqual({
			toolCalls: { bash: 1 },
			toolErrors: 1,
			turns: 1,
			tokens: 10,
			cost: 0.5,
			models: ["p/m"],
			errors: ["rate limited", "error"],
		});
	});
});

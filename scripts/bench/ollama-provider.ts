/**
 * Benchmark-only Pi extension: registers local Ollama models as the `ollama` provider so the
 * Explicit Edit runner can use them without editing ~/.pi/agent/models.json.
 *
 *   BENCH_OLLAMA_MODELS=qwen3:4b,other:tag   (default: qwen3:4b)
 *   BENCH_OLLAMA_URL=http://localhost:11434/v1
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function benchOllamaProvider(pi: ExtensionAPI): void {
	const ids = (process.env.BENCH_OLLAMA_MODELS ?? "qwen3:4b")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	pi.registerProvider("ollama", {
		baseUrl: process.env.BENCH_OLLAMA_URL ?? "http://localhost:11434/v1",
		api: "openai-completions",
		apiKey: "ollama",
		models: ids.map((id) => ({
			id,
			name: `${id} (ollama)`,
			reasoning: false,
			input: ["text"],
			contextWindow: 32768,
			maxTokens: 8192,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		})),
	});
}

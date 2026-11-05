// The pilot's analysis record (unmaintained, not tested): draw 5 (locate task, model, attempt) combos with a fixed seed and copy each arm's trace
// under a shuffled id, so 5 traces per arm are reviewed without their labels. The key is written to
// key.json, to be opened only after the notes. Usage: node sample.mjs <out dir> <review dir>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, review] = process.argv.slice(2);
let seed = 7;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffle = (items) => {
	const a = [...items];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};
const results = readFileSync(join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const arms = ["stock", "extension", "no-ls-find", "no-ls-find-grep"];
const combos = [...new Set(results.filter((r) => r.set === "locate").map((r) => `${r.model}|${r.task}|${r.attempt}`))].sort();
const picked = shuffle(combos).slice(0, 5);
const traces = picked.flatMap((combo) => {
	const [model, task, attempt] = combo.split("|");
	return arms.map((arm) => ({ model, task, attempt, arm, path: join(out, "traces", model.replace(/[^\w.-]+/g, "_"), arm, `${task}#${attempt}.jsonl`) }));
});
mkdirSync(review, { recursive: true });
const key = shuffle(traces).map((trace, i) => ({ id: `T${String(i + 1).padStart(2, "0")}`, ...trace }));
for (const { id, path } of key) {
	if (!existsSync(path)) throw new Error(`missing ${path}`);
	copyFileSync(path, join(review, `${id}.jsonl`));
}
writeFileSync(join(review, "key.json"), JSON.stringify(key, null, 2));
console.log(key.map((k) => k.id).join(" "));

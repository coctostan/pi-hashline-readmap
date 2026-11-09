// The fifth arm's analysis record (unmaintained, not tested): ruling 0008's rule, as the pilot's verdict.mjs applies it,
// on this run's arms. Per set and model, for each pair (the first arm with what it adds, the second without), each
// metric's gap counts only beyond the larger of the two arms' repeat spreads. The first pair is the ruled one: the
// `grep` tool against anchored bash grep, ties going to the leaner arm, the anchors.
// Usage: node verdict.mjs <out dir> [excluded task ids, comma-separated]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeRuns } from "../../scripts/bench/tool-ab.mjs";

const [out, exclude = ""] = process.argv.slice(2);
const skip = new Set(exclude.split(",").filter(Boolean));
const results = readFileSync(join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !skip.has(r.task));
const rows = summarizeRuns(results);
const PAIRS = [
	["grep tool over anchors", "no-ls-find", "bash-grep-anchors"],
	["anchors over plain bash", "bash-grep-anchors", "no-ls-find-grep"],
	["grep tool over plain bash", "no-ls-find", "no-ls-find-grep"],
];
// Higher is better for pass; lower for the rest. toolCalls is shown, not judged.
const JUDGED = ["pass", "inputTokens", "cost", "errors", "rejected", "redundant", "wrongTool", "callsBeforeTouch"];
const fmt = (v) => (v === null || v === undefined ? "-" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3).replace(/\.?0+$/, "") || "0");
console.log("| pair | set | model | metric | with | without | gap | bar | verdict |\n|---|---|---|---|---:|---:|---:|---:|---|");
for (const [pair, withArm, withoutArm] of PAIRS) for (const set of ["locate", "edit"]) for (const model of [...new Set(rows.map((r) => r.model))]) {
	const a = rows.find((r) => r.set === set && r.model === model && r.arm === withArm);
	const b = rows.find((r) => r.set === set && r.model === model && r.arm === withoutArm);
	if (!a || !b) continue;
	const tally = { wins: [], losses: [] };
	for (const metric of [...JUDGED, "toolCalls"]) {
		const [x, y] = [a.metrics[metric], b.metrics[metric]];
		if (x.mean === null || y.mean === null) continue;
		const gap = x.mean - y.mean;
		const bar = Math.max(x.spread ?? 0, y.spread ?? 0);
		const better = metric === "pass" ? gap > 0 : gap < 0;
		// The tolerance keeps a gap equal to the bar a tie despite float residue (1/3 against 1/3).
		const verdict = Math.abs(gap) <= bar + 1e-9 ? "tie" : better ? "with wins" : "with loses";
		if (JUDGED.includes(metric) && verdict !== "tie") tally[better ? "wins" : "losses"].push(metric);
		console.log(`| ${pair} | ${set} | ${model} | ${metric}${JUDGED.includes(metric) ? "" : " (not judged)"} | ${fmt(x.mean)} | ${fmt(y.mean)} | ${fmt(gap)} | ${fmt(bar)} | ${verdict} |`);
	}
	console.error(`${pair} ${set} ${model}: wins ${tally.wins.join(",") || "none"}; loses ${tally.losses.join(",") || "none"} → ${tally.wins.length && !tally.losses.length ? `${withArm} KEPT` : `${withArm} not kept`}`);
}

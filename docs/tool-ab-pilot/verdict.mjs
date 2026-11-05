// The pilot's analysis record (unmaintained, not tested): apply the rule of slice 7 (Pilot proposes a ruling) to a tool-ab run. Per set and model, for each ruled pair (with the tool vs
// without it), each metric's gap counts only beyond the larger of the two arms' repeat spreads.
// Usage: node verdict.mjs <out dir> [excluded task ids, comma-separated]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeRuns } from "../../scripts/bench/tool-ab.mjs";

const [out, exclude = ""] = process.argv.slice(2);
const skip = new Set(exclude.split(",").filter(Boolean));
const results = readFileSync(join(out, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !skip.has(r.task));
const rows = summarizeRuns(results);
const PAIRS = [["ls+find", "extension", "no-ls-find"], ["grep", "no-ls-find", "no-ls-find-grep"]];
// Higher is better for pass; lower for the rest. toolCalls is shown, not judged.
const JUDGED = ["pass", "inputTokens", "cost", "errors", "rejected", "redundant", "wrongTool", "callsBeforeTouch"];
const fmt = (v) => (v === null || v === undefined ? "-" : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3).replace(/\.?0+$/, "") || "0");
console.log("| tool | set | model | metric | with | without | gap | bar | verdict |\n|---|---|---|---|---:|---:|---:|---:|---|");
for (const [tool, withArm, withoutArm] of PAIRS) for (const set of ["locate", "edit"]) for (const model of [...new Set(rows.map((r) => r.model))]) {
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
		const verdict = Math.abs(gap) <= bar + 1e-9 ? "tie" : better ? "tool wins" : "tool loses";
		if (JUDGED.includes(metric) && verdict !== "tie") tally[better ? "wins" : "losses"].push(metric);
		console.log(`| ${tool} | ${set} | ${model} | ${metric}${JUDGED.includes(metric) ? "" : " (not judged)"} | ${fmt(x.mean)} | ${fmt(y.mean)} | ${fmt(gap)} | ${fmt(bar)} | ${verdict} |`);
	}
	console.error(`${tool} ${set} ${model}: wins ${tally.wins.join(",") || "none"}; loses ${tally.losses.join(",") || "none"} → ${tally.wins.length && !tally.losses.length ? "KEEP" : "not kept"}`);
}

import { diffArrays } from "diff";
import { computeLineHash, escapeControlCharsForDisplay, parseLineRef } from "./hashline.js";
import type { PtcLine } from "./ptc-value.js";

/**
 * What the model was last shown of each file, as `line -> hash`.
 *
 * Anchors already verify the lines they name, but a range or a text `replace` also overwrites
 * lines between or around its anchors. If one of those lines changed on disk after the model saw
 * it, the edit would silently discard that change. This registry lets `edit` refuse such writes
 * and answer with the current rows instead.
 *
 * Line numbers drift when lines are added above, so a line counts as current when its hash was
 * shown anywhere within `SHIFT_WINDOW` lines. A line is stale only when the model was shown a
 * different hash at that exact line and the current hash was not shown nearby. Lines the model
 * was never shown are not judged.
 */
const SHIFT_WINDOW = 20;
const ROW_RE = /^(\d+):([0-9a-f]{3})(?:\|.*)?$/;

export interface StaleLine {
	line: number;
	hash: string;
	raw: string;
}

/** Shown anchors a write moved: earliest such old line, its shift, and how many moved. */
export interface ShiftSummary {
	fromLine: number;
	delta: number;
	count: number;
}

/** Old line (index = line - 1) -> new line, from a line diff; undefined for removed lines. */
function diffLineMap(oldLines: readonly string[], newLines: readonly string[]): Array<number | undefined> {
	const map: Array<number | undefined> = [];
	let newLine = 1;
	for (const part of diffArrays(oldLines as string[], newLines as string[])) {
		const count = part.value.length;
		if (part.added) newLine += count;
		else if (part.removed) for (let i = 0; i < count; i++) map.push(undefined);
		else for (let i = 0; i < count; i++) map.push(newLine++);
	}
	return map;
}
export class ServedLines {
	private readonly files = new Map<string, Map<number, string>>();
	/**
	 * Per file: anchors (`LINE:HASH`) the model was shown before this tool's own writes moved their
	 * lines -> current line, or null when that line was replaced, removed, or maps ambiguously.
	 */
	private readonly shifted = new Map<string, Map<string, number | null>>();

	/** Record shown rows. `complete` replaces what was known (a full-file view). */
	record(path: string, rows: Iterable<{ line: number; hash: string }>, complete = false): void {
		let served = this.files.get(path);
		if (!served || complete) {
			served = new Map();
			this.files.set(path, served);
		}
		if (complete) this.shifted.delete(path);
		const shifted = this.shifted.get(path);
		for (const row of rows) {
			if (Number.isInteger(row.line) && row.line > 0 && typeof row.hash === "string") {
				const hash = row.hash.toLowerCase();
				served.set(row.line, hash);
				shifted?.delete(`${row.line}:${hash}`);
			}
		}
		if (shifted && !shifted.size) this.shifted.delete(path);
	}

	/** Record rows given as `LINE:HASH` anchors (grep records, error feedback). */
	recordAnchors(path: string, anchors: Iterable<string>): void {
		const rows: Array<{ line: number; hash: string }> = [];
		for (const anchor of anchors) {
			const match = ROW_RE.exec(anchor);
			if (match) rows.push({ line: Number(match[1]), hash: match[2] });
		}
		if (rows.length) this.record(path, rows);
	}

	/** Paths with recorded rows, most recently recorded last. */
	paths(): string[] {
		return [...this.files.keys()].filter((path) => this.has(path));
	}
	has(path: string): boolean {
		return (this.files.get(path)?.size ?? 0) > 0;
	}

	forget(path: string): void {
		this.files.delete(path);
		this.shifted.delete(path);
	}

	/**
	 * Where an anchor shown before this tool's own writes now lives: the current line, `null` when
	 * its line was replaced, removed, or cannot be mapped unambiguously, or `undefined` when it did
	 * not move.
	 */
	shiftedAnchor(path: string, line: number, hash: string): number | null | undefined {
		const target = this.shifted.get(path)?.get(`${line}:${hash.toLowerCase()}`);
		return target === line ? undefined : target;
	}

	/** Lines in `lineNumbers` (1-based, of `currentLines`) that changed since the model saw them. */
	findStale(path: string, currentLines: readonly string[], lineNumbers: Iterable<number>): StaleLine[] {
		const served = this.files.get(path);
		if (!served?.size) return [];
		const stale: StaleLine[] = [];
		for (const line of lineNumbers) {
			const raw = currentLines[line - 1];
			if (raw === undefined) continue;
			const shownHere = served.get(line);
			if (shownHere === undefined) continue;
			const hash = computeLineHash(line, raw);
			if (shownHere === hash) continue;
			let shownNearby = false;
			for (let other = Math.max(1, line - SHIFT_WINDOW); other <= line + SHIFT_WINDOW && !shownNearby; other++) {
				shownNearby = served.get(other) === hash;
			}
			if (!shownNearby) stale.push({ line, hash, raw });
		}
		return stale;
	}

	/**
	 * After this tool wrote `newLines`, carry unchanged lines' served hashes to their new line
	 * numbers and mark written lines as served: the model authored them and saw the diff.
	 * `lineMap` (old line index -> new line) is the exact mapping when the writer knows it.
	 */
	remapAfterWrite(
		path: string,
		oldLines: readonly string[],
		newLines: readonly string[],
		lineMap: readonly (number | undefined)[] = diffLineMap(oldLines, newLines),
	): ShiftSummary | undefined {
		const served = this.files.get(path);
		const next = new Map<number, string>();
		const carried = new Set<number>();
		for (let oldLine = 1; oldLine <= oldLines.length; oldLine++) {
			const target = lineMap[oldLine - 1];
			if (target === undefined) continue;
			carried.add(target);
			const shown = served?.get(oldLine);
			if (shown !== undefined) next.set(target, shown);
		}
		for (let line = 1; line <= newLines.length; line++) {
			if (!carried.has(line)) next.set(line, computeLineHash(line, newLines[line - 1]));
		}
		this.files.set(path, next);
		return this.recordShifts(path, served, lineMap);
	}

	/** Compose earlier shifts through this write, then add the shown anchors this write moved. */
	private recordShifts(path: string, served: ReadonlyMap<number, string> | undefined, lineMap: readonly (number | undefined)[]): ShiftSummary | undefined {
		const shifted = new Map<string, number | null>();
		const put = (key: string, target: number | null) => {
			shifted.set(key, shifted.has(key) && shifted.get(key) !== target ? null : target);
		};
		for (const [key, target] of this.shifted.get(path) ?? []) put(key, target === null ? null : (lineMap[target - 1] ?? null));
		let summary: ShiftSummary | undefined;
		for (const [line, hash] of served ?? []) {
			const target = lineMap[line - 1] ?? null;
			if (target === line) continue;
			put(`${line}:${hash}`, target);
			if (target === null) continue;
			if (!summary) summary = { fromLine: line, delta: target - line, count: 0 };
			else if (line < summary.fromLine) {
				summary.fromLine = line;
				summary.delta = target - line;
			}
			summary.count++;
		}
		if (shifted.size) this.shifted.set(path, shifted);
		else this.shifted.delete(path);
		return summary;
	}
}

/** Changed or removed original lines (1-based) between two versions of a file. */
export function overwrittenLines(oldLines: readonly string[], newLines: readonly string[]): number[] {
	const touched: number[] = [];
	let oldLine = 1;
	for (const part of diffArrays(oldLines as string[], newLines as string[])) {
		const count = part.value.length;
		if (part.removed) for (let i = 0; i < count; i++) touched.push(oldLine + i);
		if (!part.added) oldLine += count;
	}
	return touched;
}

/** Rows to show for stale lines: each with one line of context, as fresh LINE:HASH rows. */
export function formatStaleRows(currentLines: readonly string[], stale: readonly StaleLine[]): { text: string; rows: PtcLine[] } {
	const staleSet = new Set(stale.map((entry) => entry.line));
	const show = new Set<number>();
	for (const { line } of stale) {
		for (let other = Math.max(1, line - 1); other <= Math.min(currentLines.length, line + 1); other++) show.add(other);
	}
	const rows: PtcLine[] = [];
	const out: string[] = [];
	let previous = -1;
	for (const line of [...show].sort((a, b) => a - b)) {
		const raw = currentLines[line - 1] ?? "";
		const hash = computeLineHash(line, raw);
		const display = escapeControlCharsForDisplay(raw);
		if (previous !== -1 && line > previous + 1) out.push("    ...");
		previous = line;
		out.push(`${staleSet.has(line) ? ">>> " : "    "}${line}:${hash}|${display}`);
		rows.push({ line, hash, anchor: `${line}:${hash}`, raw, display });
	}
	return { text: out.join("\n"), rows };
}

/** Parse anchors out of arbitrary `LINE:HASH` strings, ignoring the malformed ones. */
export function anchorsToRows(anchors: Iterable<string>): Array<{ line: number; hash: string }> {
	const rows: Array<{ line: number; hash: string }> = [];
	for (const anchor of anchors) {
		try {
			const parsed = parseLineRef(anchor);
			if (parsed.line > 0) rows.push({ line: parsed.line, hash: parsed.hash });
		} catch {
			// not an anchor
		}
	}
	return rows;
}

type ResolvePath = (path: string) => string;

function lineRows(value: unknown): Array<{ line: number; hash: string }> {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(row): row is { line: number; hash: string } =>
			!!row && typeof row === "object" && typeof (row as any).line === "number" && typeof (row as any).hash === "string",
	);
}

/**
 * Record the rows a successful read, grep, ast_search, or write result showed, from its
 * structured `details.ptcValue`.
 */
export function recordServedFromResult(served: ServedLines, toolName: string, details: unknown, resolvePath: ResolvePath): void {
	const ptc = details && typeof details === "object" ? (details as { ptcValue?: any }).ptcValue : undefined;
	if (!ptc || typeof ptc !== "object" || ptc.ok === false || ptc.error) return;
	if (toolName === "read" && typeof ptc.path === "string") {
		const range = ptc.range ?? {};
		const complete = range.startLine === 1 && range.endLine === range.totalLines && !ptc.truncation && !ptc.symbol;
		const rows = lineRows(ptc.lines);
		const bundleAnchors: string[] = Array.isArray(ptc.bundle?.localSupport)
			? ptc.bundle.localSupport.flatMap((item: any) => (Array.isArray(item?.lineAnchors) ? item.lineAnchors : []))
			: [];
		if (rows.length || complete) served.record(resolvePath(ptc.path), rows, complete);
		if (bundleAnchors.length) served.recordAnchors(resolvePath(ptc.path), bundleAnchors);
	} else if (toolName === "write" && typeof ptc.path === "string") {
		served.record(resolvePath(ptc.path), lineRows(ptc.lines), true);
	} else if (toolName === "grep" && Array.isArray(ptc.records)) {
		const byPath = new Map<string, string[]>();
		for (const record of ptc.records) {
			if (typeof record?.path !== "string" || typeof record?.anchor !== "string") continue;
			const list = byPath.get(record.path) ?? [];
			list.push(record.anchor);
			byPath.set(record.path, list);
		}
		for (const [path, anchors] of byPath) served.recordAnchors(resolvePath(path), anchors);
	} else if (toolName === "ast_search" && Array.isArray(ptc.files)) {
		for (const file of ptc.files) {
			if (typeof file?.path === "string") served.record(resolvePath(file.path), lineRows(file.lines));
		}
	}
}

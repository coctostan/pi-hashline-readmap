import type { FileMap } from "./types.js";
import type { SymbolMatch } from "./symbol-lookup.js";

export const AMBIGUOUS_CANDIDATE_LIMIT = 5;

export interface AmbiguitySummary {
	shownCandidates: SymbolMatch[];
	omittedCandidates: SymbolMatch[];
	omittedCount: number;
	totalCandidates: number;
}

export function summarizeAmbiguity(candidates: SymbolMatch[]): AmbiguitySummary {
	const shownCandidates = candidates.slice(0, AMBIGUOUS_CANDIDATE_LIMIT);
	const omittedCandidates = candidates.slice(AMBIGUOUS_CANDIDATE_LIMIT);
	return {
		shownCandidates,
		omittedCandidates,
		omittedCount: omittedCandidates.length,
		totalCandidates: candidates.length,
	};
}

export function formatAmbiguous(query: string, candidates: SymbolMatch[]): string {
	const { shownCandidates, omittedCandidates, omittedCount } = summarizeAmbiguity(candidates);
	const qualified = (candidate: SymbolMatch) => candidate.parentName
		? `${candidate.parentName}.${candidate.name}`
		: candidate.name;
	const selector = (candidate: SymbolMatch) => candidate.parentName
		? `${qualified(candidate)} or ${query}@${candidate.startLine}`
		: `${query}@${candidate.startLine}`;
	const rows = shownCandidates.map(
		(candidate) => `- ${qualified(candidate)} (${candidate.kind}) — lines ${candidate.startLine}-${candidate.endLine}`,
	);
	const output = [`Symbol '${query}' is ambiguous.`, "Matches:", ...rows];
	if (omittedCount > 0) {
		output.push(
			`${omittedCount} additional candidates omitted. Omitted selectors: ${omittedCandidates.map(selector).join(", ")}.`,
		);
	}
	output.push(`Use ${shownCandidates.map(selector).join(" or ")} to select a shown candidate.`);
	return output.join("\n");
}

export function formatNotFound(query: string, map: FileMap): string {
	const available = map.symbols.slice(0, 20).map((s) => s.name).join(", ");
	return `[Warning: symbol '${query}' not found. Available symbols: ${available}]`;
}

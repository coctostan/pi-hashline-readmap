import { generateMapFromContent } from "./readmap/mapper.js";
import { detectLanguage } from "./readmap/language-detect.js";
import { findSymbol, type SymbolMatchTier } from "./readmap/symbol-lookup.js";
import { formatAmbiguous, formatNotFound } from "./readmap/symbol-error-format.js";
import { extractReplacementDeclarationName } from "./replacement-declaration-name.js";

export interface ReplaceSymbolInput {
	filePath: string;
	content: string;
	symbol: string;
	newBody: string;
}

export type ReplaceSymbolResult =
	| { type: "ok"; content: string; replacement: string; warnings: string[]; range: { start: number; end: number }; matchTier: SymbolMatchTier }
	| { type: "not-found"; message: string }
	| { type: "ambiguous"; message: string }
	| { type: "unsupported"; message: string };

function detectIndent(line: string): string {
	return line.match(/^\s*/)?.[0] ?? "";
}

function dedent(text: string): string {
	const lines = text.split("\n");
	const nonEmpty = lines.filter((l) => l.trim().length);
	if (!nonEmpty.length) return text;
	const minIndent = Math.min(...nonEmpty.map((l) => l.match(/^\s*/)?.[0].length ?? 0));
	return lines.map((l) => l.slice(minIndent)).join("\n");
}

function reindent(text: string, indent: string): string {
	return text.split("\n").map((l) => (l.length ? indent + l : l)).join("\n");
}

const PRECISE_CONTENT_MAPPER_LANGUAGES = new Set(["typescript", "javascript", "rust", "java"]);

export async function replaceSymbol(input: ReplaceSymbolInput): Promise<ReplaceSymbolResult> {
	const map = await generateMapFromContent(input.filePath, input.content);
	if (!map) {
		const langInfo = detectLanguage(input.filePath);
		if (langInfo && !PRECISE_CONTENT_MAPPER_LANGUAGES.has(langInfo.id)) {
			return {
				type: "unsupported",
				message: `Unsupported ${langInfo.name} file for replace_symbol: no precise in-memory mapper is registered. Use anchored edits for this file type.`,
			};
		}
		return { type: "not-found", message: `[Warning: symbol '${input.symbol}' not found. Available symbols: ]` };
	}
	const lookup = findSymbol(map, input.symbol);
	if (lookup.type === "not-found") {
		return { type: "not-found", message: formatNotFound(input.symbol, map) };
	}
	if (lookup.type === "ambiguous") {
		return { type: "ambiguous", message: formatAmbiguous(input.symbol, lookup.candidates) };
	}
	const sym = lookup.symbol;
	const lines = input.content.split("\n");
	const sigLine = lines[sym.startLine - 1] ?? "";
	const indent = detectIndent(sigLine);
	const reindented = reindent(dedent(input.newBody), indent);
	const warnings: string[] = [];
	if (lookup.type === "fuzzy") {
		warnings.push(
			`fuzzy-symbol-match: '${input.symbol}' resolved to '${lookup.symbol.name}' via ${lookup.tier}; confirm the exact symbol before editing.`,
		);
	}
	const leaf = input.symbol.replace(/@\d+$/, "").split(".").pop() ?? "";
	const firstDeclName = await extractReplacementDeclarationName({
		filePath: input.filePath,
		newBody: reindented,
		isMember: Boolean(sym.parentName),
	});
	if (leaf && firstDeclName && firstDeclName !== leaf) {
		warnings.push(`name-mismatch: expected ${leaf}, got ${firstDeclName}`);
	}
	const before = lines.slice(0, sym.startLine - 1).join("\n");
	const after = lines.slice(sym.endLine).join("\n");
	const beforePart = before.length ? before + "\n" : "";
	const afterPart = after.length ? "\n" + after : "";
	const newContent = beforePart + reindented + afterPart;
	return {
		type: "ok",
		content: newContent,
		replacement: reindented,
		warnings,
		range: { start: sym.startLine, end: sym.endLine },
		matchTier: lookup.tier,
	};
}

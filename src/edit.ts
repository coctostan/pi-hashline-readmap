import {
	type EditToolDetails,
	type ExtensionAPI,
	renderDiff,
	type ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import { readFile as fsReadFile, writeFile as fsWriteFile } from "fs/promises";
import {
	classifyEdit,
	isDifftAvailable,
	runDifftastic,
} from "./edit-classify.js";
import {
	detectLineEnding,
	generateCompactOrFullDiff,
	normalizeToLF,
	replaceText,
	restoreLineEndings,
	stripBom,
} from "./edit-diff";
import { buildEditOutput } from "./edit-output.js";
import {
	formatEditCallText,
	formatEditResultText,
} from "./edit-render-helpers.js";
import {
	applyHashlineEdits,
	computeLineHash,
	ensureHashInit,
	escapeControlCharsForDisplay,
	type HashlineEditItem,
	HashlineMismatchError,
	parseLineRef,
} from "./hashline";
import { getOrGenerateMap } from "./map-cache.js";
import { resolveToCwd } from "./path-utils";
import type { SemanticSummary } from "./ptc-value.js";
import { buildPtcError } from "./ptc-value.js";
import { detectLanguage } from "./readmap/language-detect.js";
import { findSymbol } from "./readmap/symbol-lookup.js";
import { throwIfAborted } from "./runtime";
import { checkSyntaxErrors, deterministicMerge } from "./symbol-merge.js";

export function wrapWriteError(err: any, path: string): Error {
	const code = err?.code;
	if (code === "EACCES" || code === "EPERM") {
		return new Error(`Permission denied: ${path}`);
	}
	return new Error(`Failed to write file: ${path}`);
}

export function isBinaryBuffer(buf: Buffer): boolean {
	return buf.includes(0);
}

/** Build a hashline anchor string ("LINE:HASH") for a 0-based line index. */
function hashlineForIndex(
	lines: string[],
	idx: number,
	_filePath: string,
): string | null {
	if (idx < 0 || idx >= lines.length) return null;
	const lineNum = idx + 1; // 1-based
	const content = lines[idx];
	const hash = computeLineHash(lineNum, content);
	return `${lineNum}:${hash}`;
}

// ─── Schema ─────────────────────────────────────────────────────────────

const hashlineEditItemSchema = Type.Union([
	Type.Object(
		{
			set_line: Type.Object({ anchor: Type.String(), new_text: Type.String() }),
		},
		{ additionalProperties: true },
	),
	Type.Object(
		{
			replace_lines: Type.Object({
				start_anchor: Type.String(),
				end_anchor: Type.String(),
				new_text: Type.String(),
			}),
		},
		{ additionalProperties: true },
	),
	Type.Object(
		{
			insert_after: Type.Object({
				anchor: Type.String(),
				new_text: Type.String(),
				text: Type.Optional(Type.String()),
			}),
		},
		{ additionalProperties: true },
	),
	Type.Object(
		{
			replace: Type.Object({
				old_text: Type.String(),
				new_text: Type.String(),
				all: Type.Optional(Type.Boolean()),
			}),
		},
		{ additionalProperties: true },
	),
	Type.Object(
		{
			replace_symbol: Type.Object({
				symbol: Type.String(),
				replacement: Type.String(),
			}),
		},
		{ additionalProperties: true },
	),
]);

const hashlineEditSchema = Type.Object(
	{
		path: Type.String({ description: "File path (relative or absolute)" }),
		edits: Type.Optional(
			Type.Array(hashlineEditItemSchema, {
				description: "Array of edit operations",
			}),
		),
	},
	{ additionalProperties: true },
);

type HashlineParams = Static<typeof hashlineEditSchema>;

const EDIT_DESC = readFileSync(
	new URL("../prompts/edit.md", import.meta.url),
	"utf-8",
).trim();

export interface EditToolOptions {
	wasReadInSession?: (absolutePath: string) => boolean;
}

// ─── Registration ───────────────────────────────────────────────────────

export function registerEditTool(
	pi: ExtensionAPI,
	options: EditToolOptions = {},
) {
	const ptc = {
		callable: true,
		enabled: true,
		policy: "mutating" as const,
		readOnly: false,
		pythonName: "edit",
		defaultExposure: "not-safe-by-default" as const,
	};
	const tool = {
		name: "edit",
		label: "Edit",
		description: EDIT_DESC,
		parameters: hashlineEditSchema,
		ptc,
		renderShell: "default" as const,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			await ensureHashInit();
			const parsed = params as HashlineParams;
			const input = params as Record<string, unknown>;
			const rawPath = parsed.path;
			const path = rawPath.replace(/^@/, "");
			const absolutePath = resolveToCwd(path, ctx.cwd);
			throwIfAborted(signal);
			if (options.wasReadInSession && !options.wasReadInSession(absolutePath)) {
				const message = [
					`You must get fresh anchors for ${absolutePath} before editing it.`,
					`Call read(${JSON.stringify(rawPath)}) first, or use grep, ast_search, or write to produce fresh anchors for this file.`,
					"edit requires fresh LINE:HASH anchors from read, grep, ast_search, or write so the hashes match the current file contents.",
				].join(" ");
				return {
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						diff: "",
						firstChangedLine: undefined,
						ptcValue: {
							tool: "edit",
							ok: false,
							path: absolutePath,
							error: buildPtcError(
								"file-not-read",
								message,
								`Call read(${JSON.stringify(rawPath)}) first, or use grep, ast_search, or write to produce fresh anchors for this file.`,
							),
						},
					} as EditToolDetails & { ptcValue: any },
				};
			}
			const legacyOldText =
				typeof input.oldText === "string"
					? input.oldText
					: typeof input.old_text === "string"
						? input.old_text
						: undefined;
			const legacyNewText =
				typeof input.newText === "string"
					? input.newText
					: typeof input.new_text === "string"
						? input.new_text
						: undefined;
			const hasLegacyInput =
				legacyOldText !== undefined || legacyNewText !== undefined;
			const hasEditsInput = Array.isArray(parsed.edits);

			let edits = parsed.edits ?? [];
			let legacyNormalizationWarning: string | undefined;
			if (!hasEditsInput && hasLegacyInput) {
				if (legacyOldText === undefined || legacyNewText === undefined) {
					const message =
						"Legacy edit input requires both oldText/newText (or old_text/new_text) when 'edits' is omitted.";
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("invalid-edit-variant", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				edits = [
					{
						replace: {
							old_text: legacyOldText,
							new_text: legacyNewText,
							...(typeof input.all === "boolean" ? { all: input.all } : {}),
						},
					},
				];
				legacyNormalizationWarning =
					"Legacy top-level oldText/newText input was normalized to edits[0].replace. Prefer the edits[] format.";
			}

			if (!edits.length) {
				return {
					content: [{ type: "text", text: "No edits provided." }],
					isError: true,
					details: {
						diff: "",
						firstChangedLine: undefined,
						ptcValue: {
							tool: "edit",
							ok: false,
							path: absolutePath,
							error: buildPtcError(
								"invalid-edit-variant",
								"No edits provided.",
							),
						},
					} as EditToolDetails & { ptcValue: any },
				};
			}

			// Validate edit variant keys
			for (let i = 0; i < edits.length; i++) {
				throwIfAborted(signal);
				const e = edits[i] as Record<string, unknown>;
				if (("old_text" in e || "new_text" in e) && !("replace" in e)) {
					const message = `edits[${i}] has top-level 'old_text'/'new_text'. Use {replace: {old_text, new_text}} or {set_line}, {replace_lines}, {insert_after}.`;
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("invalid-edit-variant", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				if ("diff" in e) {
					const message = `edits[${i}] contains 'diff' from patch mode. Hashline edit expects one of: {set_line}, {replace_lines}, {insert_after}, {replace}.`;
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("invalid-edit-variant", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				const variantCount =
					Number("set_line" in e) +
					Number("replace_lines" in e) +
					Number("insert_after" in e) +
					Number("replace" in e) +
					Number("replace_symbol" in e);
				if (variantCount !== 1) {
					const message = `edits[${i}] must contain exactly one of: 'set_line', 'replace_lines', 'insert_after', 'replace'. Got: [${Object.keys(e).join(", ")}].`;
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("invalid-edit-variant", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
			}

			const anchorEdits = edits.filter(
				(e): e is HashlineEditItem =>
					"set_line" in e || "replace_lines" in e || "insert_after" in e,
			);
			const symbolEdits = edits.filter(
				(e): e is { replace_symbol: { symbol: string; replacement: string } } =>
					"replace_symbol" in e,
			);
			const replaceEdits = edits.filter(
				(
					e,
				): e is {
					replace: { old_text: string; new_text: string; all?: boolean };
				} => "replace" in e,
			);

			let rawBuffer: Buffer;
			try {
				rawBuffer = await fsReadFile(absolutePath);
			} catch (err: any) {
				const code = err?.code;
				let errCode: string;
				let message: string;
				let hint: string | undefined;
				let errorDetails: { fsCode?: string; fsMessage?: string } | undefined;
				if (code === "EISDIR") {
					errCode = "path-is-directory";
					message = `Path is a directory: ${path}`;
					hint = `Use ls(${JSON.stringify(path)}) to inspect directories.`;
				} else if (code === "ENOENT") {
					errCode = "file-not-found";
					message = `File not found: ${path}`;
				} else if (code === "EACCES" || code === "EPERM") {
					errCode = "permission-denied";
					message = `Permission denied: ${path}`;
				} else {
					errCode = "fs-error";
					message = `File not readable: ${path}${err?.message ? ` — ${err.message}` : ""}`;
					errorDetails = { fsCode: code, fsMessage: err?.message };
				}
				return {
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						diff: "",
						firstChangedLine: undefined,
						ptcValue: {
							tool: "edit",
							ok: false,
							path: absolutePath,
							error: buildPtcError(errCode, message, hint, errorDetails),
						},
					} as EditToolDetails & { ptcValue: any },
				};
			}
			if (isBinaryBuffer(rawBuffer)) {
				const message = `Cannot edit binary file: ${path}`;
				return {
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						diff: "",
						firstChangedLine: undefined,
						ptcValue: {
							tool: "edit",
							ok: false,
							path: absolutePath,
							error: buildPtcError("binary-file", message),
						},
					} as EditToolDetails & { ptcValue: any },
				};
			}
			throwIfAborted(signal);
			const raw = rawBuffer.toString("utf-8");
			const { bom, text: content } = stripBom(raw);
			const originalEnding = detectLineEnding(content);
			const originalNormalized = normalizeToLF(content);
			let result = originalNormalized;

			let anchorResult;
			try {
				anchorResult = applyHashlineEdits(result, anchorEdits, signal);
			} catch (err) {
				if (err instanceof HashlineMismatchError) {
					return {
						content: [{ type: "text", text: err.message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("hash-mismatch", err.message, undefined, {
									updatedAnchors: err.updatedAnchors,
								}),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				throw err;
			}
			result = anchorResult.content;

			for (const r of replaceEdits) {
				throwIfAborted(signal);
				if (!r.replace.old_text.length) {
					const message = "replace.old_text must not be empty.";
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("invalid-edit-variant", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				const rep = replaceText(
					result,
					r.replace.old_text,
					r.replace.new_text,
					{ all: r.replace.all ?? false },
				);
				if (!rep.count) {
					const message = `Could not find text to replace in ${path}.`;
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("text-not-found", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				result = rep.content;
			}

			// Handle replace_symbol edits (AST-based deterministic merge)
			let hadSymbolEdits = false;
			for (const s of symbolEdits) {
				const { symbol, replacement } = s.replace_symbol;
				hadSymbolEdits = true;
				const fileMap = await getOrGenerateMap(absolutePath);
				if (!fileMap) {
					const message = `Cannot generate AST map for ${path} — file was NOT modified. replace_symbol requires a supported language. Supported: Java, TypeScript/JavaScript, Python, Rust, Go, C/C++, Clojure, Swift, SQL, JSON, YAML, TOML, CSV, Markdown, Shell. Use read(${JSON.stringify(path)}) and edit with hashline anchors for other languages.`;
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("ast-map-failed", message),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				const lookupResult = findSymbol(fileMap, symbol);
				if (lookupResult.type !== "found") {
					const hint =
						lookupResult.type === "ambiguous"
							? `Symbol "${symbol}" is ambiguous in ${path} — file was NOT modified. Matches: ${lookupResult.candidates.map((c) => c.name + (c.parentName ? ` (in ${c.parentName})` : "")).join(", ")}. Use symbol@line to disambiguate (e.g. "${symbol.split(".").pop()}@${lookupResult.candidates[0]?.symbol?.startLine ?? ""}" for the first match) or read(${JSON.stringify(path)}, { symbol: ${JSON.stringify(symbol)} }) to see all matches.`
							: lookupResult.type === "fuzzy"
								? `Symbol "${symbol}" not found in ${path} — file was NOT modified. Did you mean ${lookupResult.symbol.name}? (other candidates: ${lookupResult.otherCandidates.map((c) => c.name).join(", ")})`
								: symbol.includes(".")
									? `Symbol "${symbol}" not found in ${path} — file was NOT modified. Try using just the field/method name without the container class (e.g. "${symbol.split(".").pop()}" instead of "${symbol}").`
									: `Symbol "${symbol}" not found in ${path} — file was NOT modified.`;
					return {
						content: [{ type: "text", text: hint }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("symbol-not-found", hint),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				const { startLine, endLine } = lookupResult.symbol;
				const originalLines = result.split("\n");
				const originalSymbol =
					originalLines.slice(startLine - 1, endLine).join("\n") + "\n";
				const lineCount = endLine - startLine + 1;

				// --- Auto-fallback for short symbols (1-2 lines) ---
				if (lineCount <= 2) {
					// Use set_line with the AST map's hash anchor for the start line
					const lineIdx = startLine - 1;
					const hashLine = hashlineForIndex(
						originalLines,
						lineIdx,
						absolutePath,
					);
					if (!hashLine) {
						const message = `Symbol "${symbol}" is only ${lineCount} line(s) — too short for deterministic merge. File was NOT modified. Use read(${JSON.stringify(path)}, { symbol: ${JSON.stringify(symbol)} }) to get a hashline anchor, then edit with set_line or replace_lines.`;
						return {
							content: [{ type: "text", text: message }],
							isError: true,
							details: {
								diff: "",
								firstChangedLine: undefined,
								ptcValue: {
									tool: "edit",
									ok: false,
									path: absolutePath,
									error: buildPtcError("symbol-too-short", message),
								},
							} as EditToolDetails & { ptcValue: any },
						};
					}
					// Treat replacement as the new content for the entire symbol range
					const replacementLines = replacement.split("\n");
					// Strip trailing empty line if replacement ended with \n
					if (
						replacementLines.length > 0 &&
						replacementLines[replacementLines.length - 1] === "" &&
						replacement.endsWith("\n")
					) {
						replacementLines.pop();
					}
					// Build new_lines: the replacement lines, keeping the original indent of the first line
					const originalFirstLine = originalLines[lineIdx];
					const originalIndent = originalFirstLine.match(/^[ \t]*/)?.[0] || "";
					const replacementFirstLine = replacementLines[0] || "";
					const replacementIndent =
						replacementFirstLine.match(/^[ \t]*/)?.[0] || "";
					if (lineCount === 1) {
						// Single line: replace the entire line content
						const newContent =
							originalIndent + replacementFirstLine.trimStart();
						originalLines[lineIdx] = newContent;
						result = originalLines.join("\n");
					} else {
						// 2 lines: use replace_lines logic — replace startLine..endLine with replacementLines
						const adjustedLines = replacementLines.map((l, i) => {
							if (i === 0) return originalIndent + l.trimStart();
							return l;
						});
						const before = originalLines.slice(0, lineIdx);
						const afterB = originalLines.slice(endLine);
						result = [...before, ...adjustedLines, ...afterB].join("\n");
					}
					continue; // proceed to next symbolEdit
				}

				// --- Deterministic merge for multi-line symbols (≥3 lines) ---
				const mergeResult = deterministicMerge(originalSymbol, replacement);
				if (mergeResult.result === null) {
					const reason = mergeResult.reason || "Not enough context anchors";
					const message = `replace_symbol could not merge into ${symbol} — file was NOT modified. ${reason}. Use read(${JSON.stringify(path)}, { symbol: ${JSON.stringify(symbol)} }) and then edit with set_line/replace_lines.`;
					return {
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							diff: "",
							firstChangedLine: undefined,
							ptcValue: {
								tool: "edit",
								ok: false,
								path: absolutePath,
								error: buildPtcError("deterministic-merge-failed", reason),
							},
						} as EditToolDetails & { ptcValue: any },
					};
				}
				// Replace the symbol lines in result
				const before = originalLines.slice(0, startLine - 1);
				const afterB = originalLines.slice(endLine);
				const mergedResult = mergeResult.result;
				const mergedLines = mergedResult.split("\n");
				// Strip trailing empty line if originalSymbol ended with \n
				if (
					mergedLines[mergedLines.length - 1] === "" &&
					mergedResult.endsWith("\n")
				) {
					mergedLines.pop();
				}
				result = [...before, ...mergedLines, ...afterB].join("\n");
			}

			// Post-merge syntax validation for replace_symbol edits
			// Post-merge syntax validation: BLOCK write if syntax errors found
			if (hadSymbolEdits) {
				const langInfo = detectLanguage(absolutePath);
				if (langInfo) {
					const syntaxErrors = checkSyntaxErrors(result, langInfo.id);
					if (syntaxErrors && syntaxErrors.length > 0) {
						const lines = syntaxErrors
							.slice(0, 3)
							.map((e) => `Line ${e.line}: possible syntax error`);
						if (syntaxErrors.length > 3)
							lines.push(`...and ${syntaxErrors.length - 3} more`);
						const message = `replace_symbol produced code with syntax errors in ${path}. File was NOT modified.\n${lines.join("\n")}\nVerify the replacement includes the full symbol (signature + body + closing brace).`;
						return {
							content: [{ type: "text", text: message }],
							isError: true,
							details: {
								diff: "",
								firstChangedLine: undefined,
								ptcValue: {
									tool: "edit",
									ok: false,
									path: absolutePath,
									error: buildPtcError("syntax-error-after-merge", message),
								},
							} as EditToolDetails & { ptcValue: any },
						};
					}
				}
			}
			if (originalNormalized === result) {
				let diagnostic = `No changes made to ${path}. The edits produced identical content.`;
				if (anchorResult.noopEdits?.length) {
					diagnostic +=
						"\n" +
						anchorResult.noopEdits
							.map(
								(e) =>
									`Edit ${e.editIndex}: replacement for ${e.loc} is identical to current content:\n  ${e.loc}| ${escapeControlCharsForDisplay(e.currentContent)}`,
							)
							.join("\n");
					diagnostic += "\nRe-read the file to see the current state.";
				} else {
					// Edits were not literally identical but heuristics normalized them back
					const lines = result.split("\n");
					const targetLines: string[] = [];
					for (const edit of edits) {
						const refs: string[] = [];
						if ("set_line" in edit) refs.push((edit as any).set_line.anchor);
						else if ("replace_lines" in edit) {
							refs.push(
								(edit as any).replace_lines.start_anchor,
								(edit as any).replace_lines.end_anchor,
							);
						} else if ("insert_after" in edit)
							refs.push((edit as any).insert_after.anchor);
						for (const ref of refs) {
							try {
								const parsed = parseLineRef(ref);
								if (parsed.line >= 1 && parsed.line <= lines.length) {
									const lineContent = lines[parsed.line - 1];
									const hash = computeLineHash(parsed.line, lineContent);
									targetLines.push(
										`${parsed.line}:${hash}|${escapeControlCharsForDisplay(lineContent)}`,
									);
								}
							} catch {
								/* skip malformed refs */
							}
						}
					}
					if (targetLines.length > 0) {
						const preview = [...new Set(targetLines)].slice(0, 5).join("\n");
						diagnostic += `\nThe file currently contains:\n${preview}\nYour edits were normalized back to the original content. Ensure your replacement changes actual code, not just formatting.`;
					}
				}
				return {
					content: [{ type: "text", text: diagnostic }],
					isError: true,
					details: {
						diff: "",
						firstChangedLine: undefined,
						ptcValue: {
							tool: "edit",
							ok: false,
							path: absolutePath,
							error: buildPtcError("no-op", diagnostic),
						},
					} as EditToolDetails & { ptcValue: any },
				};
			}

			throwIfAborted(signal);
			try {
				await fsWriteFile(
					absolutePath,
					bom + restoreLineEndings(result, originalEnding),
					"utf-8",
				);
			} catch (err: any) {
				const wrapped = wrapWriteError(err, path);
				const code =
					err?.code === "EACCES" || err?.code === "EPERM"
						? "permission-denied"
						: err?.code === "ENOENT"
							? "file-not-found"
							: "fs-error";
				const message =
					code === "fs-error" && err?.message
						? `${wrapped.message} — ${err.message}`
						: wrapped.message;
				return {
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						diff: "",
						firstChangedLine: undefined,
						ptcValue: {
							tool: "edit",
							ok: false,
							path: absolutePath,
							error: buildPtcError(
								code,
								message,
								undefined,
								code === "fs-error"
									? { fsCode: err?.code, fsMessage: err?.message }
									: undefined,
							),
						},
					} as EditToolDetails & { ptcValue: any },
				};
			}

			const diffResult = generateCompactOrFullDiff(originalNormalized, result);
			const warnings: string[] = [];
			if (anchorResult.warnings?.length)
				warnings.push(...anchorResult.warnings);
			if (legacyNormalizationWarning) warnings.push(legacyNormalizationWarning);
			const internalClassification = classifyEdit(originalNormalized, result);
			const difftAvailable = await isDifftAvailable();
			let semanticSummary: SemanticSummary = {
				classification: internalClassification.classification,
				difftasticAvailable: difftAvailable,
			};

			if (difftAvailable) {
				const ext = path.split(".").pop() ?? "txt";
				const difftResult = await runDifftastic(
					originalNormalized,
					result,
					ext,
				);
				if (difftResult) {
					semanticSummary = {
						classification: difftResult.classification,
						difftasticAvailable: true,
						...(difftResult.movedBlocks > 0
							? { movedBlocks: difftResult.movedBlocks }
							: {}),
					};
				}
			}
			const builtOutput = buildEditOutput({
				path: absolutePath,
				displayPath: path,
				diff: diffResult.diff,
				firstChangedLine:
					anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
				warnings,
				noopEdits: anchorResult.noopEdits ?? [],
				edits,
				semanticSummary,
			});

			const warn = warnings.length
				? `\n\nWarnings:\n${warnings.join("\n")}`
				: "";
			return {
				content: [{ type: "text", text: builtOutput.text }],
				details: {
					diff: diffResult.diff,
					firstChangedLine:
						anchorResult.firstChangedLine ?? diffResult.firstChangedLine,
					ptcValue: builtOutput.ptcValue,
					contextHygiene: builtOutput.contextHygiene,
				} as EditToolDetails & {
					ptcValue: {
						tool: string;
						ok: boolean;
						path: string;
						summary: string;
						diff: string;
						firstChangedLine: number | undefined;
						warnings: string[];
						noopEdits: unknown[];
					};
				},
			};
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const context: { argsComplete?: boolean; lastComponent?: any } =
				rest[0] ?? {};
			const argsComplete = context.argsComplete ?? false;
			const { path: filePath, suffix } = formatEditCallText(args, argsComplete);

			let text = theme.fg("toolTitle", theme.bold("edit"));
			if (filePath) {
				text += ` ${theme.fg("accent", filePath)}`;
			} else {
				text += ` ${theme.fg("toolOutput", "...")}`;
			}
			if (suffix) {
				text += ` ${theme.fg("dim", suffix)}`;
			}

			const component = context.lastComponent ?? new Text("", 0, 0);
			component.setText(text);
			return component;
		},
		renderResult(
			result: any,
			options: ToolRenderResultOptions,
			theme: any,
			...rest: any[]
		) {
			const context: {
				isPartial?: boolean;
				isError?: boolean;
				expanded?: boolean;
				lastComponent?: any;
			} = rest[0] ?? options ?? {};
			const isPartial =
				context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = context.expanded ?? (options as any)?.expanded ?? false;

			if (isPartial) {
				return new Text(theme.fg("dim", "Editing\u2026"), 0, 0);
			}

			// Extract data from result
			const textContent =
				result.content
					?.filter((c: any) => c.type === "text")
					.map((c: any) => c.text || "")
					.join("\n") ?? "";
			const details = result.details ?? {};
			const diff: string = details.diff ?? "";
			const ptcValue = details.ptcValue as
				| {
						warnings?: string[];
						noopEdits?: unknown[];
				  }
				| undefined;
			const warnings = ptcValue?.warnings ?? [];
			const noopEdits = ptcValue?.noopEdits ?? [];
			const semanticClassification = (ptcValue as any)?.semanticSummary
				?.classification as string | undefined;

			const info = formatEditResultText({
				isError: isError || !!result.isError,
				diff,
				warnings,
				noopEdits,
				errorText: textContent,
				semanticClassification: semanticClassification as any,
			});

			// Build display text
			let text = "";

			if (info.noOp) {
				// No-op error
				text = theme.fg("warning", "\u26a0 no-op");
				if (expanded && info.errorText) {
					text += `\n${theme.fg("error", info.errorText)}`;
				}
			} else if (info.errorText) {
				// Non-noop error
				const firstLine = info.errorText.split("\n")[0] || "Error";
				text = theme.fg("error", firstLine);
				if (expanded && info.errorText.includes("\n")) {
					text = theme.fg("error", info.errorText);
				}
			} else {
				// Success
				const parts: string[] = [];
				if (info.diffStats) {
					parts.push(theme.fg("success", info.diffStats));
				}
				if (info.warningsBadge) {
					parts.push(theme.fg("warning", info.warningsBadge));
				}
				if (info.semanticBadge) {
					parts.push(theme.fg("dim", info.semanticBadge));
				}
				text = parts.join("  ") || theme.fg("success", "\u2713");

				if (expanded) {
					if (diff) {
						text += `\n${renderDiff(diff)}`;
					}
					if (warnings.length > 0) {
						text += `\n${theme.fg("warning", "Warnings:")}`;
						for (const w of warnings) {
							text += `\n  ${theme.fg("dim", w)}`;
						}
					}
				}
			}

			const component = context.lastComponent ?? new Text("", 0, 0);
			component.setText(text);
			return component;
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

import type { ExtensionAPI, ToolRenderResultOptions, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { withLegacyLiteralOrder } from "./typebox-schema-order.js";
import { defineToolPromptMetadata } from "./tool-prompt-metadata.js";
import { readFile as fsReadFile } from "fs/promises";
import { normalizeToLF, stripBom, hasBareCarriageReturn } from "./edit-diff.js";
import { ensureHashInit } from "./hashline.js";
import { buildPtcError, buildPtcWarning, type PtcWarning } from "./ptc-value.js";
import { looksLikeBinary } from "./binary-detect.js";
import { resolveToCwd } from "./path-utils.js";
import { throwIfAborted } from "./runtime.js";
import { getOrGenerateMap } from "./map-cache.js";
import { formatFileMapWithBudget } from "./readmap/formatter.js";
import { findSymbol, type SymbolMatch, type SymbolMatchTier } from "./readmap/symbol-lookup.js";
import { formatAmbiguous, formatNotFound, summarizeAmbiguity } from "./readmap/symbol-error-format.js";
import { buildReadOutput, buildReadSourceOutput } from "./read-output.js";
import { buildReadRehydrateDescriptor } from "./context-hygiene.js";
import { buildLocalBundle } from "./read-local-bundle.js";
import { coerceObviousBase10Int } from "./coerce-obvious-int.js";
import { Text } from "@earendil-works/pi-tui";
import { formatReadCallText, formatReadResultText } from "./read-render-helpers.js";
import { buildCollapsedPreview, clampLineToWidth, clampLinesToWidth, isRendererExpanded, linkToolPath, renderToolLabel, summaryLine, wrapLinesToWidth, wrapReadHashlinesForWidth } from "./tui-render-utils.js";
import { resolvePreviewLines } from "./hashline-settings.js";
import {
	buildRequiredNullParameterError,
	normalizeToolParameters,
} from "./normalize-tool-params.js";

const READ_PROMPT_METADATA = defineToolPromptMetadata({
	promptUrl: new URL("../prompts/read.md", import.meta.url),
	promptSnippet: "Read text files or images; text reads include hashline anchors and optional maps/symbol lookup",
	promptGuidelines: [
		"Use read instead of bash cat/head/tail/sed for file inspection.",
		"Use read for images/screenshots; supported images return attachments like stock pi read.",
		"Use read offset/limit, symbol, or map to keep large files focused.",
		"Use read anchors as fresh inputs for edit.",
	],
});

interface ReadParams {
	path: string;
	offset?: number | string;
	limit?: number | string;
	symbol?: string;
	map?: boolean;
	bundle?: "local";
}

interface ReadToolOptions {
	onSuccessfulRead?: (absolutePath: string) => void;
}

interface ReadResultDetails {
	ptcValue?: {
		tool?: string;
		ok?: boolean;
		path?: string;
		warnings?: PtcWarning[];
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

function withParamAdjustments<T extends AgentToolResult<any>>(
	result: T,
	path: string,
	adjustments: string[],
): T {
	if (adjustments.length === 0) return result;
	const warning = buildPtcWarning(
		"params-adjusted",
		`[Read params adjusted: ${adjustments.join("; ")}]`,
	);
	const content = [...result.content];
	const textIndex = content.findIndex((item) => item.type === "text");
	if (textIndex >= 0 && content[textIndex]?.type === "text") {
		const item = content[textIndex];
		content[textIndex] = { ...item, text: `${warning.message}\n\n${item.text}` };
	} else {
		content.unshift({ type: "text", text: warning.message });
	}
	const details = ((result.details && typeof result.details === "object") ? result.details : {}) as ReadResultDetails;
	const ptcValue = details.ptcValue ?? {};
	return {
		...result,
		content,
		details: {
			...details,
			ptcValue: {
				tool: "read",
				ok: (result as { isError?: boolean }).isError !== true,
				path,
				...ptcValue,
				warnings: [warning, ...(ptcValue.warnings ?? [])],
			},
		},
	} as T;
}

const READ_PARAMETERS = Type.Object({
	path: Type.String({ description: "File path" }),
	offset: Type.Optional(
		Type.Union([
			Type.Number({ description: "Positive 1-indexed int or base-10 string; not with symbol" }),
			Type.String({ description: "Positive 1-indexed int or base-10 string; not with symbol" }),
		]),
	),
	limit: Type.Optional(
		Type.Union([
			Type.Number({ description: "Positive int or obvious base-10 numeric string" }),
			Type.String({ description: "Positive int or obvious base-10 numeric string" }),
		]),
	),
	symbol: Type.Optional(Type.String({ description: "Non-empty; may combine with limit, map, or local bundle" })),
	map: Type.Optional(Type.Boolean({ description: "Append map; valid with symbol, limit, and local bundle" })),
	bundle: Type.Optional(
		withLegacyLiteralOrder(Type.Literal("local", {
			description: "local; requires symbol; valid with limit and map",
		})),
	),
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
	return buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

function startsWithAscii(buffer: Buffer, offset: number, text: string): boolean {
	if (buffer.length < offset + text.length) return false;
	for (let index = 0; index < text.length; index++) {
		if (buffer[offset + index] !== text.charCodeAt(index)) return false;
	}
	return true;
}

function readUint32BE(buffer: Buffer, offset: number): number {
	return (
		((buffer[offset] ?? 0) * 0x1000000) +
		((buffer[offset + 1] ?? 0) << 16) +
		((buffer[offset + 2] ?? 0) << 8) +
		(buffer[offset + 3] ?? 0)
	);
}

function isPng(buffer: Buffer): boolean {
	return buffer.length >= 16 && readUint32BE(buffer, PNG_SIGNATURE.length) === 13 && startsWithAscii(buffer, 12, "IHDR");
}

function isAnimatedPng(buffer: Buffer): boolean {
	let offset = PNG_SIGNATURE.length;
	while (offset + 8 <= buffer.length) {
		const chunkLength = readUint32BE(buffer, offset);
		const chunkTypeOffset = offset + 4;
		if (startsWithAscii(buffer, chunkTypeOffset, "acTL")) return true;
		if (startsWithAscii(buffer, chunkTypeOffset, "IDAT")) return false;
		const nextOffset = offset + 8 + chunkLength + 4;
		if (nextOffset <= offset || nextOffset > buffer.length) return false;
		offset = nextOffset;
	}
	return false;
}

function isSupportedImageBuffer(buffer: Buffer): boolean {
	if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return buffer[3] !== 0xf7;
	if (startsWithBytes(buffer, PNG_SIGNATURE)) return isPng(buffer) && !isAnimatedPng(buffer);
	if (startsWithAscii(buffer, 0, "GIF")) return true;
	return startsWithAscii(buffer, 0, "RIFF") && startsWithAscii(buffer, 8, "WEBP");
}


export function registerReadTool(pi: ExtensionAPI, options: ReadToolOptions = {}) {
	const ptc = {
		callable: true,
		enabled: true,
		policy: "read-only" as const,
		readOnly: true,
		pythonName: "read",
		defaultExposure: "safe-by-default" as const,
	};

	const tool = {
		name: "read",
		label: "Read",
		description: READ_PROMPT_METADATA.description,
		promptSnippet: READ_PROMPT_METADATA.promptSnippet,
		promptGuidelines: READ_PROMPT_METADATA.promptGuidelines,
		parameters: READ_PARAMETERS,
		ptc,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const normalizedParams = normalizeToolParameters(READ_PARAMETERS, params);
			if (normalizedParams.requiredNull) {
				return buildRequiredNullParameterError("read", normalizedParams.requiredNull);
			}
			const rawParams = normalizedParams.value as ReadParams;
			const paramAdjustments: string[] = [];
			const finish = <T extends AgentToolResult<any>>(result: T): T =>
				withParamAdjustments(result, rawParams.path, paramAdjustments);
			const rawOffset = rawParams.offset === "" ? undefined : rawParams.offset;
			if (rawParams.offset === "") paramAdjustments.push("ignored empty offset");
			const rawLimit = rawParams.limit === "" ? undefined : rawParams.limit;
			if (rawParams.limit === "") paramAdjustments.push("ignored empty limit");
			await ensureHashInit();
			const offset = coerceObviousBase10Int(rawOffset, "offset");
			if (!offset.ok) {
				return finish({
					content: [{ type: "text", text: offset.message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-offset", offset.message),
						},
					},
				});
			}
			const limit = coerceObviousBase10Int(rawLimit, "limit");
			if (!limit.ok) {
				return finish({
					content: [{ type: "text", text: limit.message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-limit", limit.message),
						},
					},
				});
			}
			let limitValue = limit.value;
			if (limitValue === 0) {
				limitValue = undefined;
				paramAdjustments.push("ignored limit 0");
			}
			if (limitValue !== undefined && limitValue < 0) {
				const message = `Invalid limit: expected a positive integer, received ${limitValue}.`;
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-limit", message),
						},
					},
				});
			}
			let offsetValue = offset.value;
			if (offsetValue === 0) {
				offsetValue = undefined;
				paramAdjustments.push("ignored offset 0");
			}
			if (offsetValue !== undefined && offsetValue < 0) {
				const message = `Invalid offset: expected a positive integer, received ${offsetValue}.`;
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-offset", message),
						},
					},
				});
			}
			let symbolValue = rawParams.symbol;
			const invalidSymbolType = rawParams.symbol !== undefined && typeof rawParams.symbol !== "string";
			if (typeof rawParams.symbol === "string") {
				const trimmedSymbol = rawParams.symbol.trim();
				if (trimmedSymbol.length === 0) {
					symbolValue = undefined;
					paramAdjustments.push("ignored empty symbol");
				} else {
					symbolValue = trimmedSymbol;
				}
			}

			const p = {
				...rawParams,
				offset: offsetValue,
				limit: limitValue,
				symbol: symbolValue,
			};

			if (invalidSymbolType) {
				const message = "Invalid symbol: expected a non-empty string.";
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-params-combo", message),
						},
					},
				});
			}
			const rawPath = p.path.replace(/^@/, "");
			const absolutePath = resolveToCwd(rawPath, ctx.cwd);
			const succeed = <T extends AgentToolResult<any>>(result: T): T => {
				const finished = finish(result);
				const isError = (finished as { isError?: boolean }).isError;
				if (!isError) {
					options.onSuccessfulRead?.(absolutePath);
				}
				return finished;
			};

			throwIfAborted(signal);
			if (p.symbol && p.offset !== undefined) {
				const message = "Cannot combine symbol with offset. Either omit offset and use limit to cap the symbol, or use a trailing symbol@line selector.";
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-params-combo", message),
						},
					},
				});
			}
			if (p.bundle && !p.symbol) {
				const message = 'Cannot use bundle without symbol. Use read({ path, symbol, bundle: "local" }).';
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("invalid-params-combo", message),
						},
					},
				});
			}
			// Delegate images to the built-in read tool
			throwIfAborted(signal);
			const ext = rawPath.split(".").pop()?.toLowerCase() ?? "";
			if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
				const builtinRead = createReadTool(ctx.cwd);
				return succeed(await builtinRead.execute(_toolCallId, p, signal, _onUpdate));
			}

			throwIfAborted(signal);
			let rawBuffer: Buffer;
			try {
				rawBuffer = await fsReadFile(absolutePath);
			} catch (err: any) {
				const code = err?.code;
				if (code === "EISDIR") {
					const message = `Path is a directory: ${rawPath}. Use ls to inspect directories.`;
					return finish({
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							ptcValue: {
								tool: "read",
								ok: false,
								path: rawParams.path,
								error: buildPtcError(
									"path-is-directory",
									message,
									`Use ls(${JSON.stringify(rawPath)}) to inspect directories.`,
								),
							},
						},
					});
				}
				if (code === "EACCES" || code === "EPERM") {
					const message = `Permission denied — cannot access: ${rawPath}`;
					return finish({
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							ptcValue: {
								tool: "read",
								ok: false,
								path: rawParams.path,
								error: buildPtcError("permission-denied", message),
							},
						},
					});
				}
				if (code === "ENOENT") {
					const message = `File not found: ${rawPath}`;
					return finish({
						content: [{ type: "text", text: message }],
						isError: true,
						details: {
							ptcValue: {
								tool: "read",
								ok: false,
								path: rawParams.path,
								error: buildPtcError("file-not-found", message),
							},
						},
					});
				}
				const message = `File not readable: ${rawPath}${err?.message ? ` — ${err.message}` : ""}`;
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("fs-error", message, undefined, {
								fsCode: code,
								fsMessage: err?.message,
							}),
						},
					},
				});
			}

			if (isSupportedImageBuffer(rawBuffer)) {
				const builtinRead = createReadTool(ctx.cwd);
				return succeed(await builtinRead.execute(_toolCallId, p, signal, _onUpdate));
			}
			const hasBinaryContent = looksLikeBinary(rawBuffer);
			throwIfAborted(signal);
			const normalized = normalizeToLF(stripBom(rawBuffer.toString("utf-8")).text);
			const allLines = normalized.split("\n");
			const total = allLines.length;
			const structuredWarnings: PtcWarning[] = [];
			let startLine = p.offset !== undefined ? p.offset : 1;
			let endIdx = p.limit !== undefined && !p.symbol ? Math.min(startLine - 1 + p.limit, total) : total;
			if (p.offset !== undefined && startLine > total) {
				const message = `[offset ${p.offset} is past end of file (${total} lines)]`;
				return finish({
					content: [{ type: "text", text: message }],
					isError: true,
					details: {
						ptcValue: {
							tool: "read",
							ok: false,
							path: rawParams.path,
							error: buildPtcError("offset-past-end", message),
						},
					},
				});
			}
			let symbolMatch: SymbolMatch | undefined;
			let symbolMatchTier: SymbolMatchTier | undefined;
			let symbolFileMap: Awaited<ReturnType<typeof getOrGenerateMap>> | null = null;
			let symbolWarning: string | undefined;
			let bundleMetadata:
				| {
						mode: "local";
						applied: boolean;
						localSupport: Array<{
							symbol: {
								query: string;
								name: string;
								kind: string;
								parentName?: string;
								startLine: number;
								endLine: number;
							};
							lines: string[];
						}>;
						warnings: PtcWarning[];
				  }
				| null = null;
			if (p.symbol) {
				symbolFileMap = await getOrGenerateMap(absolutePath);
				if (!symbolFileMap) {
					const extLabel = ext || "unknown";
					symbolWarning = `[Warning: symbol lookup not available for .${extLabel} files — showing full file]\n\n`;
				} else {
					const lookup = findSymbol(symbolFileMap, p.symbol);
					if (lookup.type === "ambiguous") {
						const summary = summarizeAmbiguity(lookup.candidates);
						return succeed({
							content: [{ type: "text", text: formatAmbiguous(p.symbol, lookup.candidates) }],
							isError: false,
							details: {
								ptcValue: {
									tool: "read",
									ok: true,
									path: rawParams.path,
									ambiguity: {
										query: p.symbol,
										tier: lookup.tier,
										totalCandidates: summary.totalCandidates,
										displayedCandidates: summary.shownCandidates,
										omittedCandidates: summary.omittedCandidates,
										omittedSelectors: summary.omittedCandidates.map((candidate) =>
											candidate.parentName
												? `${candidate.parentName}.${candidate.name} or ${p.symbol}@${candidate.startLine}`
												: `${p.symbol}@${candidate.startLine}`),
										omittedCount: summary.omittedCount,
									},
								},
							},
						});
					}
					if (lookup.type === "not-found") {
						symbolWarning = `${formatNotFound(p.symbol, symbolFileMap)}\n\n`;
					}
					if (lookup.type === "found") {
						startLine = Math.max(1, lookup.symbol.startLine);
						const symbolEndLine = Math.min(total, lookup.symbol.endLine);
						endIdx = p.limit !== undefined
							? Math.min(symbolEndLine, startLine + p.limit - 1)
							: symbolEndLine;
						symbolMatch = lookup.symbol;
						symbolMatchTier = lookup.tier;
					}
					if (lookup.type === "fuzzy") {
						startLine = Math.max(1, lookup.symbol.startLine);
						const symbolEndLine = Math.min(total, lookup.symbol.endLine);
						endIdx = p.limit !== undefined
							? Math.min(symbolEndLine, startLine + p.limit - 1)
							: symbolEndLine;
						symbolMatch = lookup.symbol;
						symbolMatchTier = lookup.tier;

						const tierLabels: Record<typeof lookup.tier, string> = {
							prefix: "prefix",
							camelCase: "camelCase word boundary",
							substring: "substring",
						};
						const otherNames = lookup.otherCandidates.map((c) => `\`${c.name}\``).join(", ");
						const confirmHint = `read({ symbol: "${lookup.symbol.name}" }) or ${lookup.symbol.name}@${lookup.symbol.startLine} to select by start line`;
						const lines = [
							`[Symbol '${p.symbol}' not exact-matched. Closest match: \`${lookup.symbol.name}\` (${lookup.symbol.kind}, lines ${lookup.symbol.startLine}-${lookup.symbol.endLine}) via ${tierLabels[lookup.tier]}.`,
						];
						if (otherNames) lines.push(` Other candidates: ${otherNames}.`);
						lines.push(` To confirm: ${confirmHint}.]`);
						const bannerText = lines.join("\n");
						structuredWarnings.push(
							buildPtcWarning("fuzzy-symbol-match", bannerText, {
								tier: lookup.tier,
								symbol: lookup.symbol,
								otherCandidates: lookup.otherCandidates,
							}),
						);
					}
				}
			}

			if (p.bundle === "local") {
				if (!symbolFileMap) {
					const extLabel = ext || "unknown";
					const warning = buildPtcWarning(
						"bundle-unmappable",
						`[Warning: local bundle unavailable because symbol mapping is not available for .${extLabel} files — showing plain symbol read]`,
					);
					structuredWarnings.push(warning);
					bundleMetadata = {
						mode: "local",
						applied: false,
						localSupport: [],
						warnings: [warning],
					};
				} else if (!symbolMatch) {
					bundleMetadata = {
						mode: "local",
						applied: false,
						localSupport: [],
						warnings: [],
					};
				} else {
					const bundle = buildLocalBundle(symbolFileMap, symbolMatch, allLines);
					if (!bundle) {
						const warning = buildPtcWarning(
							"bundle-context-unavailable",
							`[Warning: local bundle context could not be determined for symbol '${symbolMatch.name}' — showing plain symbol read]`,
						);
						structuredWarnings.push(warning);
						bundleMetadata = {
							mode: "local",
							applied: false,
							localSupport: [],
							warnings: [warning],
						};
					} else {
						bundleMetadata = {
							mode: "local",
							applied: true,
							localSupport: bundle.support.map((item) => ({
								symbol: {
									query: item.symbol.name,
									name: item.symbol.name,
									kind: item.symbol.kind,
									parentName: item.symbol.parentName,
									startLine: item.symbol.startLine,
									endLine: item.symbol.endLine,
								},
								lines: item.lines,
							})),
							warnings: [],
						};
					}
				}
			}

			const selected = allLines.slice(startLine - 1, endIdx);
			const sourceOutput = buildReadSourceOutput({
				startLine,
				totalLines: total,
				selectedLines: selected,
			});
			const truncation = sourceOutput.truncation;

			// Append structural map: on-demand or automatic for an actually truncated full-file read.
			const shouldAppendMap =
				!!p.map ||
				(!!truncation && !p.offset && !symbolMatch && (!p.limit || !!p.symbol));
			let appendedMap = false;
			let mapText: string | null = null;
			if (shouldAppendMap) {
				try {
					const fileMap = await getOrGenerateMap(absolutePath);
					if (fileMap) {
						mapText = formatFileMapWithBudget(fileMap);
						appendedMap = true;
					}
				} catch {
					// Map formatting failed — still return hashlined content without map.
				}
			}

			if (symbolWarning) {
				structuredWarnings.push(buildPtcWarning("symbol-warning", symbolWarning.trim()));
			}

			if (hasBinaryContent) {
				const warning = "[Warning: file appears to be binary — output may be garbled]";
				structuredWarnings.push(buildPtcWarning("binary-content", warning));
			}

			if (hasBareCarriageReturn(rawBuffer.toString("utf-8"))) {
				const warning = "[Warning: file contains bare CR (\\r) line endings — line numbering may be inconsistent with grep and other tools]";
				structuredWarnings.push(buildPtcWarning("bare-cr", warning));
			}

			const symbolEndLine = symbolMatch
				? Math.min(total, symbolMatch.endLine)
				: undefined;
			const symbolContinuation = symbolMatch && p.limit !== undefined && symbolEndLine !== undefined && (endIdx < symbolEndLine || truncation)
				? {
						nextOffset: truncation ? startLine + truncation.outputLines : endIdx + 1,
						limit: truncation
							? endIdx - (startLine + truncation.outputLines) + 1
							: Math.min(p.limit, symbolEndLine - endIdx),
					}
				: null;
			const readOutput = buildReadOutput({
					path: absolutePath,
					startLine,
					endLine: endIdx,
					totalLines: total,
					selectedLines: selected,
					warnings: structuredWarnings,
					// Deprecated compatibility projection; sourceOutput remains authoritative.
					truncation,
					continuation: symbolContinuation ?? (
						!truncation && !symbolMatch && endIdx < total
							? { nextOffset: endIdx + 1 }
							: null
					),
					symbol: symbolMatch
						? {
								query: p.symbol ?? symbolMatch.name,
								name: symbolMatch.name,
								kind: symbolMatch.kind,
								parentName: symbolMatch.parentName,
								startLine: symbolMatch.startLine,
								endLine: symbolMatch.endLine,
								tier: symbolMatchTier,
							}
						: null,
					map: {
						requested: !!p.map,
						appended: appendedMap,
						text: mapText,
					},
					...(bundleMetadata ? { bundle: bundleMetadata } : {}),
					rehydrate: buildReadRehydrateDescriptor({
						path: p.path,
						offset: p.offset,
						limit: p.limit,
						symbol: p.symbol,
						map: p.map,
						bundle: p.bundle,
					}),
				},
				sourceOutput,
			);

			return succeed({
				content: [{ type: "text", text: readOutput.text }],
				details: {
					truncation: readOutput.truncation ?? undefined,
					ptcValue: readOutput.ptcValue,
					contextHygiene: readOutput.contextHygiene,
				},
			});
		},
		renderCall(args: any, theme: any, ...rest: any[]) {
			const context = rest[0] ?? {};
			const cwd = context.cwd ?? process.cwd();
			const { path: filePath, suffix } = formatReadCallText(args);
			const rangeSuffix = typeof args?.offset === "number" && typeof args?.limit === "number" && args.offset > 0 && args.limit > 0
				? `:${args.offset}-${args.offset + args.limit - 1}`
				: "";
			let text = renderToolLabel(theme, "read");
			if (filePath) {
				text += ` ${linkToolPath(theme.fg("accent", `${filePath}${rangeSuffix}`), filePath, cwd)}`;
			} else {
				text += ` ${theme.fg("toolOutput", "...")}`;
			}
			if (!rangeSuffix && suffix) text += ` ${theme.fg("dim", suffix)}`;
			return new Text(clampLineToWidth(text, context.width), 0, 0);
		},
		renderResult(result: any, options: ToolRenderResultOptions, theme: any, ...rest: any[]) {
			const context: { isPartial?: boolean; isError?: boolean; expanded?: boolean; cwd?: string; width?: number } = rest[0] ?? options ?? {};
			const isPartial = context.isPartial ?? (options as any)?.isPartial ?? false;
			const isError = context.isError ?? false;
			const expanded = isRendererExpanded(options as any, context as any);
			const width = context.width ?? (options as any)?.width;
			if (isPartial) return new Text(clampLinesToWidth([summaryLine("pending read")], width).join("\n"), 0, 0);

			const content = result.content?.[0];
			const textContent = content?.type === "text" ? content.text : "";
			const ptcValue = (result.details as any)?.ptcValue as {
				range?: { startLine: number; endLine: number; totalLines: number };
				truncation: any;
				symbol: any;
				map: any;
				warnings: PtcWarning[];
				ambiguity?: { query?: unknown };
				error?: { message?: unknown };
			} | undefined;

			if (isError || result.isError) {
				const firstLine = textContent.split("\n")[0] || "Error";
				const structuredMessage = typeof ptcValue?.error?.message === "string" && ptcValue.error.message
					? ptcValue.error.message
					: firstLine;
				if (expanded) {
					const rows = wrapLinesToWidth(
						[summaryLine(structuredMessage), ...(textContent ? textContent.split("\n") : [])],
						width,
					);
					return new Text(rows.join("\n"), 0, 0);
				}
				return new Text(
					clampLinesToWidth([summaryLine(structuredMessage)], width).join("\n"),
					0,
					0,
				);
			}
			if (ptcValue?.ambiguity) {
				const firstLine = textContent.split("\n").find((line: string) => line.trim().length > 0) || "Ambiguous symbol";
				const ambiguitySummary = typeof ptcValue.ambiguity.query === "string"
					? `Symbol '${ptcValue.ambiguity.query}' is ambiguous.`
					: firstLine;
				const summary = summaryLine(ambiguitySummary, {
					hidden: !!textContent && !expanded,
				});
				if (expanded && textContent) {
					return new Text(
						wrapLinesToWidth([summary, ...textContent.split("\n")], width).join("\n"),
						0,
						0,
					);
				}
				return new Text(summary, 0, 0);
			}
			if (!ptcValue?.range) {
				const lines = textContent.split("\n").filter(Boolean).length || textContent.split("\n").length;
				const summary = summaryLine(`loaded ${lines} ${lines === 1 ? "line" : "lines"}`, {
					hidden: !!textContent && !expanded,
				});
				if (expanded && textContent) {
					return new Text(
						wrapLinesToWidth([summary, ...textContent.split("\n")], width).join("\n"),
						0,
						0,
					);
				}
				return new Text(summary, 0, 0);
			}

			const info = formatReadResultText({ range: ptcValue.range, truncation: ptcValue.truncation, symbol: ptcValue.symbol, map: ptcValue.map, warnings: ptcValue.warnings });
			const visibleLines = info.truncated && ptcValue.truncation ? ptcValue.truncation.outputLines : ptcValue.range.endLine - ptcValue.range.startLine + 1;
			const loadedWord = visibleLines === 1 ? "line" : "lines";
			const summaryParts: string[] = [info.truncated ? `loaded ${visibleLines} of ${ptcValue.truncation?.totalLines ?? ptcValue.range.totalLines} ${loadedWord} (truncated)` : `loaded ${visibleLines} ${loadedWord}`];
			if (info.symbolBadge) summaryParts.push(info.symbolBadge);
			for (const badge of info.badges) summaryParts.push(badge);
			const summary = summaryParts.join(" • ");
			if (expanded && textContent) {
				const text = summaryLine(summary) + "\n" + wrapReadHashlinesForWidth(textContent, width);
				return new Text(clampLinesToWidth(text.split("\n"), width).join("\n"), 0, 0);
			}
			const preview = buildCollapsedPreview(textContent, resolvePreviewLines(), width, { hashlines: true });
			const summaryRow = summaryLine(summary, { hidden: !!textContent && preview.lines.length === 0 });
			const out = [summaryRow, ...(preview.hint ? [preview.hint] : []), ...preview.lines];
			return new Text(clampLinesToWidth(out, width).join("\n"), 0, 0);
		},
	} satisfies Parameters<ExtensionAPI["registerTool"]>[0] & { ptc: typeof ptc };

	pi.registerTool(tool);
	return tool;
}

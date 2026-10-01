import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { DiffData } from "./diff-data.js";
import { renderTuiDiff } from "./tui-diff-renderer.js";
import { clampLineToWidth, getExpandHint, normalizeWidth, type RendererTheme } from "./tui-render-utils.js";

export interface DiffPreviewComponentOptions {
	/**
	 * Lines rendered before the diff body (e.g. tool summary, "pending edit"
	 * header). Each entry is one logical line; the component is responsible
	 * for clamping to the render-time width.
	 */
	prefixLines?: string[];
	/**
	 * Lines rendered after the diff body (e.g. trailing hints). Currently
	 * unused but kept for symmetry.
	 */
	suffixLines?: string[];
	/** Diff body data. */
	diffData: DiffData;
	/** Theme passed through to renderTuiDiff for color tinting. */
	theme: RendererTheme;
	/** Whether the diff body should render in expanded form. */
	expanded: boolean;
	/**
	 * Optional fallback width used when render() receives an invalid width
	 * (zero, negative, NaN). Defaults to 80.
	 */
	fallbackWidth?: number;
}

/**
 * Self-rendering component for a tool's diff preview that defers wrapping
 * decisions to the TUI render pass.
 *
 * `renderTuiDiff` (and the underlying `wrapWithHangingIndent` helper) need
 * the real viewport width to choose between split / unified / compact / summary
 * modes and to wrap long content rows with prefix-aligned continuation lines.
 * Pi's `ToolRenderContext` does NOT carry the render-time width, so any
 * pre-baked output is forced to assume a fallback (80 columns). This
 * component holds the source data instead, then renders at the width pi's TUI
 * actually passes in.
 */
export class DiffPreviewComponent implements Component {
	private options: DiffPreviewComponentOptions;
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;
	private cachedExpandHint: string | undefined;

	constructor(options: DiffPreviewComponentOptions) {
		this.options = options;
	}

	update(options: DiffPreviewComponentOptions): void {
		this.options = options;
		this.invalidate();
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
		this.cachedExpandHint = undefined;
	}

	render(width: number): string[] {
		const normalized = normalizeWidth(width, this.options.fallbackWidth ?? 80);
		const expandHint = this.options.expanded ? undefined : getExpandHint();
		if (
			this.cachedLines &&
			this.cachedWidth === normalized &&
			this.cachedExpandHint === expandHint
		) return this.cachedLines;
		const lines: string[] = [];
		for (const prefix of this.options.prefixLines ?? []) {
			for (const line of prefix.split("\n")) lines.push(clampLineToWidth(line, normalized));
		}
		const body = renderTuiDiff({
			diffData: this.options.diffData,
			width: normalized,
			theme: this.options.theme,
			expanded: this.options.expanded,
		});
		for (const line of body.lines) lines.push(line);
		for (const suffix of this.options.suffixLines ?? []) {
			for (const line of suffix.split("\n")) lines.push(clampLineToWidth(line, normalized));
		}
		const clamped = lines.map(line =>
			visibleWidth(line) <= normalized ? line : clampLineToWidth(line, normalized),
		);
		this.cachedLines = clamped;
		this.cachedWidth = normalized;
		this.cachedExpandHint = expandHint;
		return clamped;
	}
}

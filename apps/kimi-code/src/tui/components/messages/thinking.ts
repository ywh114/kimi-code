/**
 * Renders thinking content in the transcript.
 * Supports live in-place updates while thinking streams, then finalizes
 * without replacing the component.
 *
 * Live (streaming) thinking can be expanded/collapsed with Ctrl+E.
 * Finalized thinking is always shown in full; Ctrl+E does not affect it.
 */

import { Text, truncateToWidth, type Component, type TUI } from '@moonshot-ai/pi-tui';

import {
  BRAILLE_SPINNER_FRAMES,
  BRAILLE_SPINNER_INTERVAL_MS,
  MESSAGE_INDENT,
  THINKING_PREVIEW_LINES,
} from '#/tui/constant/rendering';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import { currentTheme } from '#/tui/theme';
import { isRenderCacheEnabled } from '#/tui/utils/render-cache';

export type ThinkingRenderMode = 'live' | 'finalized';

export class ThinkingComponent implements Component {
  private text: string;
  private showMarker: boolean;
  private mode: ThinkingRenderMode;
  private expanded = false;
  private readonly ui: TUI | undefined;
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | undefined;
  // Hold a single Text instance so pi-tui's (text, width) → lines cache
  // actually survives across renders. Re-constructing per render destroys
  // the cache and forces full re-wrap on every frame, which dominates CPU
  // once the transcript accumulates many finalized thinking blocks.
  private readonly textComponent: Text;

  // Cache the wrapped content lines (without any prefix/spinner). This is
  // invalidated only when the text changes, not on spinner frame changes.
  private contentRenderCache: { width: number; lines: string[] } | undefined;
  // Cache the final rendered output (with prefixes/spinner). This is cheap
  // to rebuild from contentRenderCache.
  private renderCache: { width: number; lines: string[] } | undefined;

  constructor(
    text: string,
    showMarker: boolean = true,
    mode: ThinkingRenderMode = 'finalized',
    ui?: TUI,
  ) {
    this.text = text;
    this.showMarker = showMarker;
    this.mode = mode;
    this.ui = ui;
    this.textComponent = new Text(this.styled(text), 0, 0);
  }

  private markRenderDirty(): void {
    this.renderCache = undefined;
  }

  private markContentDirty(): void {
    this.contentRenderCache = undefined;
    this.markRenderDirty();
  }

  invalidate(): void {
    this.markRenderDirty();
    this.textComponent.setText(this.styled(this.text));
  }

  setText(text: string): void {
    if (this.text === text) return;
    this.text = text;
    this.markContentDirty();
    this.textComponent.setText(this.styled(text));
  }

  private styled(text: string): string {
    return currentTheme.italicFg('textDim', text);
  }

  finalize(): void {
    this.mode = 'finalized';
    this.markRenderDirty();
    this.syncSpinner(false);
  }

  dispose(): void {
    this.stopSpinner();
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    this.markRenderDirty();
  }

  render(width: number): string[] {
    if (
      isRenderCacheEnabled() &&
      this.renderCache !== undefined &&
      this.renderCache.width === width
    ) {
      return this.renderCache.lines;
    }

    const contentWidth = Math.max(1, width - MESSAGE_INDENT.length);
    let contentLines: string[];
    if (
      isRenderCacheEnabled() &&
      this.contentRenderCache !== undefined &&
      this.contentRenderCache.width === width
    ) {
      contentLines = this.contentRenderCache.lines;
    } else {
      contentLines = this.text.length > 0 ? this.textComponent.render(contentWidth) : [''];
      if (isRenderCacheEnabled()) {
        this.contentRenderCache = { width, lines: contentLines };
      }
    }

    let rendered: string[];
    let effectiveExpanded = false;
    if (this.mode === 'live') {
      effectiveExpanded =
        this.expanded || contentLines.length <= THINKING_PREVIEW_LINES;
      const visibleLines = effectiveExpanded
        ? contentLines
        : contentLines.slice(contentLines.length - THINKING_PREVIEW_LINES);
      if (effectiveExpanded) {
        // Expanded live thinking uses a static bullet and does not animate the
        // braille spinner. This avoids a full re-render of the (potentially
        // large) expanded block every 80ms, which was causing severe flashing
        // when tool outputs update nearby.
        const bullet = currentTheme.fg('textDim', STATUS_BULLET);
        const lines: string[] = [''];
        for (let i = 0; i < visibleLines.length; i++) {
          const p = i === 0 ? bullet : MESSAGE_INDENT;
          lines.push(p + visibleLines[i]);
        }
        rendered = lines;
      } else {
        const spinner = currentTheme.fg(
          'textDim',
          `${BRAILLE_SPINNER_FRAMES[this.spinnerFrame] ?? BRAILLE_SPINNER_FRAMES[0]} `,
        );
        rendered = [
          '',
          spinner + currentTheme.fg('textDim', 'thinking...'),
          ...visibleLines.map((line) => MESSAGE_INDENT + line),
        ];
      }
    } else {
      const lines: string[] = [''];
      for (let i = 0; i < contentLines.length; i++) {
        const p =
          i === 0 && this.showMarker
            ? currentTheme.fg('textDim', STATUS_BULLET)
            : MESSAGE_INDENT;
        lines.push(p + contentLines[i]);
      }

      // Finalized thinking is always shown in full; ctrl+y only affects the
      // live (streaming) thinking view.
      rendered = lines;
    }

    this.syncSpinner(effectiveExpanded);

    if (isRenderCacheEnabled()) {
      this.renderCache = { width, lines: rendered };
    }
    return rendered;
  }

  private syncSpinner(expanded: boolean): void {
    const shouldSpin =
      this.mode === 'live' &&
      this.ui !== undefined &&
      !expanded;
    if (shouldSpin) {
      this.startSpinner();
    } else {
      this.stopSpinner();
    }
  }

  private startSpinner(): void {
    if (this.ui === undefined || this.spinnerInterval !== undefined) return;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % BRAILLE_SPINNER_FRAMES.length;
      this.markRenderDirty();
      this.ui?.requestRender();
    }, BRAILLE_SPINNER_INTERVAL_MS);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval === undefined) return;
    clearInterval(this.spinnerInterval);
    this.spinnerInterval = undefined;
  }
}

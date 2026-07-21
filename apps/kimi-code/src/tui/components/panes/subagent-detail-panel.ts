/**
 * Subagent detail panel — full read-only view of one subagent (text, thinking,
 * sub-tool calls, result). Opened with Ctrl+↓; ←/→ and Ctrl+↑/↓ move between
 * agent cards; Esc closes. Read-only: no input focus, no editing — scrolling
 * is driven by the editor's ↑/↓-on-empty hook, like the /btw and SHELL panels.
 */

import type { Component } from '@moonshot-ai/pi-tui';
import { Text, truncateToWidth, visibleWidth } from '@moonshot-ai/pi-tui';
import chalk from 'chalk';

import { currentTheme } from '../../theme';
import type { ToolCallSubagentDetail, ToolCallSubagentDetailCall } from '../messages/tool-call';

const MIN_PANEL_LINES = 3;
const SUBCALL_OUTPUT_PREVIEW_LINES = 5;

export interface SubagentDetailPanelOptions {
  readonly terminalRows: () => number;
}

export interface SubagentDetailPosition {
  /** 1-based index of the current agent in the flat agent-card list. */
  readonly index: number;
  /** Total agent cards currently known. */
  readonly total: number;
}

export class SubagentDetailPanelComponent implements Component {
  private detail: ToolCallSubagentDetail | undefined;
  private position: SubagentDetailPosition = { index: 1, total: 1 };
  private scrollTop = 0;
  private maxScrollTop = 0;
  /**
   * Follow the tail (auto-scroll to bottom) until the user scrolls up. Running
   * agents grow at the bottom, so this keeps the latest output in view; it
   * re-arms once the user scrolls back down to the bottom.
   */
  private followTail = true;

  constructor(private readonly options: SubagentDetailPanelOptions) {}

  setDetail(detail: ToolCallSubagentDetail, position: SubagentDetailPosition): void {
    const switched = this.detail?.toolCallId !== detail.toolCallId;
    this.detail = detail;
    this.position = position;
    if (switched) {
      // A different agent: start following its tail from the bottom.
      this.followTail = true;
      this.scrollTop = 0;
    }
  }

  scroll(direction: 'up' | 'down'): boolean {
    if (direction === 'up') {
      if (this.scrollTop <= 0) return false;
      this.scrollTop -= 1;
      this.followTail = false;
      return true;
    }
    if (this.scrollTop >= this.maxScrollTop) return false;
    this.scrollTop += 1;
    if (this.scrollTop >= this.maxScrollTop) this.followTail = true;
    return true;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(4, width);
    const contentWidth = Math.max(1, safeWidth - 4);
    const body = this.renderBody(contentWidth);
    const windowed = this.windowBody(body);
    return [
      this.renderTopBorder(safeWidth, body.length > windowed.length),
      ...windowed.map((line) => this.renderBodyLine(line, safeWidth)),
    ];
  }

  private renderTopBorder(width: number, scrollable: boolean): string {
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    const d = this.detail;
    const name = d?.agentName ?? 'agent';
    const pos = ` ${String(this.position.index)}/${String(this.position.total)} `;
    const hint = `Esc close · ←→ cycle${scrollable ? ' · ↑↓ scroll ' : ' '}`;
    const title =
      chalk.hex(currentTheme.palette.accent).bold(` AGENT ${name}${pos}`) +
      paint('─ ') +
      chalk.hex(currentTheme.palette.textMuted)(hint);
    const innerWidth = Math.max(1, width - 2);
    const clippedTitle =
      visibleWidth(title) > innerWidth ? truncateToWidth(title, innerWidth, '') : title;
    const dashCount = Math.max(0, innerWidth - visibleWidth(clippedTitle));
    return paint('╭') + clippedTitle + paint('─'.repeat(dashCount)) + paint('╮');
  }

  private renderBodyLine(line: string, width: number): string {
    const innerWidth = Math.max(1, width - 2);
    const clipped = visibleWidth(line) > innerWidth ? truncateToWidth(line, innerWidth, '') : line;
    const padding = ' '.repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    return paint('│ ') + clipped + padding + paint('│');
  }

  private windowBody(lines: string[]): string[] {
    const bodyLimit = Math.max(MIN_PANEL_LINES, this.options.terminalRows() - 10);
    const target = Math.max(MIN_PANEL_LINES, Math.min(bodyLimit, lines.length));
    this.maxScrollTop = Math.max(0, lines.length - target);
    this.scrollTop = this.followTail
      ? this.maxScrollTop
      : Math.max(0, Math.min(this.scrollTop, this.maxScrollTop));
    return lines.slice(this.scrollTop, this.scrollTop + target);
  }

  private renderBody(contentWidth: number): string[] {
    const d = this.detail;
    if (d === undefined) {
      return [chalk.hex(currentTheme.palette.textDim)('No subagent selected.')];
    }
    const dim = (s: string): string => chalk.hex(currentTheme.palette.textDim)(s);
    const lines: string[] = [];

    // Header: phase + stats.
    lines.push(this.renderPhaseLine(d));
    if (d.description.length > 0) {
      lines.push(...wrap(dim(d.description), contentWidth));
    }

    if (d.thinkingText.length > 0) {
      lines.push('');
      lines.push(...wrap(currentTheme.italicFg('textDim', d.thinkingText), contentWidth));
    }
    if (d.text.length > 0) {
      lines.push('');
      lines.push(...wrap(d.text, contentWidth));
    }

    if (d.subCalls.length > 0 || d.hiddenSubCallCount > 0) {
      lines.push('');
      lines.push(chalk.hex(currentTheme.palette.textMuted)(`── tools (${String(d.subCalls.length + d.hiddenSubCallCount)}) ──`));
      if (d.hiddenSubCallCount > 0) {
        lines.push(dim(`… ${String(d.hiddenSubCallCount)} earlier tool call(s) not shown`));
      }
      for (const call of d.subCalls) {
        this.appendSubCall(lines, call, contentWidth);
      }
    }

    if (d.resultSummary !== undefined && d.resultSummary.length > 0) {
      lines.push('');
      lines.push(...wrap(d.resultSummary, contentWidth));
    }
    if (d.errorText !== undefined && d.errorText.length > 0) {
      lines.push('');
      lines.push(...wrap(chalk.hex(currentTheme.palette.error)(d.errorText), contentWidth));
    }
    return lines;
  }

  private renderPhaseLine(d: ToolCallSubagentDetail): string {
    const tokens = d.tokens > 0 ? ` · ${String(d.tokens)} tok` : '';
    switch (d.phase) {
      case 'done':
        return chalk.hex(currentTheme.palette.success)(`✓ Completed${tokens}`);
      case 'failed':
        return chalk.hex(currentTheme.palette.error)(`✗ Failed${tokens}`);
      case 'backgrounded':
        return chalk.hex(currentTheme.palette.textDim)(`◐ backgrounded${tokens}`);
      case 'queued':
        return chalk.hex(currentTheme.palette.primary)(`Waiting${tokens}`);
      case 'running':
        return chalk.hex(currentTheme.palette.primary)(`Running${tokens}`);
      case 'spawning':
      case undefined:
        return chalk.hex(currentTheme.palette.primary)(`Starting${tokens}`);
    }
  }

  private appendSubCall(
    lines: string[],
    call: ToolCallSubagentDetailCall,
    contentWidth: number,
  ): void {
    const dim = (s: string): string => chalk.hex(currentTheme.palette.textDim)(s);
    const marker = call.phase === 'ongoing' ? '▸' : call.isError === true ? '✗' : '•';
    const color =
      call.phase === 'ongoing'
        ? currentTheme.palette.primary
        : call.isError === true
          ? currentTheme.palette.error
          : currentTheme.palette.textDim;
    lines.push(
      chalk.hex(color)(`${marker} ${call.name}${formatCallArgs(call.args)}`),
    );
    if (call.output !== undefined && call.output.trim().length > 0) {
      const preview = call.output
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .slice(0, SUBCALL_OUTPUT_PREVIEW_LINES);
      for (const line of preview) {
        lines.push(...wrap(dim(`  ${line}`), contentWidth));
      }
    }
  }
}

function wrap(text: string, width: number): string[] {
  return new Text(text, 0, 0).render(width);
}

function formatCallArgs(args: Record<string, unknown>): string {
  const preferred = args['description'] ?? args['command'] ?? args['path'] ?? args['prompt'];
  if (typeof preferred === 'string' && preferred.length > 0) {
    const flat = preferred.replaceAll('\n', ' ');
    return chalk.hex(currentTheme.palette.textMuted)(
      ` · ${flat.length > 60 ? `${flat.slice(0, 59)}…` : flat}`,
    );
  }
  return '';
}

/**
 * Shell-eval side panel — displays raw output from a shell command executed
 * by a side agent (triggered by the `!!` prefix).
 *
 * Much narrower than /btw: no chat history, no markdown rendering of the
 * answer, just the command and its raw output.
 */

import type { Component } from '@moonshot-ai/pi-tui';
import { Text, truncateToWidth, visibleWidth } from '@moonshot-ai/pi-tui';
import chalk from 'chalk';

import { currentTheme } from '../../theme';

const MIN_PANEL_LINES = 3;

export type ShellEvalPhase = 'running' | 'done' | 'failed';

export interface ShellEvalPanelOptions {
  readonly terminalRows: () => number;
  readonly onClose: () => void;
}

interface RenderedBody {
  readonly lines: string[];
  readonly truncated: boolean;
}

export class ShellEvalPanelComponent implements Component {
  private command = '';
  private output = '';
  private phase: ShellEvalPhase = 'running';
  private error: string | undefined;
  private scrollTop = 0;
  private followTail = true;
  private maxScrollTop = 0;

  constructor(private readonly options: ShellEvalPanelOptions) {}

  setCommand(command: string): void {
    this.command = command;
  }

  appendOutput(text: string): void {
    this.output += text;
  }

  markDone(): void {
    this.phase = 'done';
  }

  markFailed(error: string): void {
    this.phase = 'failed';
    this.error = error;
  }

  isRunning(): boolean {
    return this.phase === 'running';
  }

  invalidate(): void {}

  render(width: number): string[] {
    const safeWidth = Math.max(4, width);
    const contentWidth = Math.max(1, safeWidth - 4);
    const body = this.renderBody(contentWidth);
    return [
      this.renderTopBorder(safeWidth, body.truncated),
      ...body.lines.map((line) => this.renderBodyLine(line, safeWidth)),
    ];
  }

  private renderTopBorder(width: number, truncated: boolean): string {
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    const hint = truncated ? 'Esc close · ↑↓ scroll ' : 'Esc close ';
    const title =
      chalk.hex(currentTheme.palette.accent).bold(' SHELL ') +
      paint('─ ') +
      chalk.hex(currentTheme.palette.textMuted)(hint);
    const innerWidth = Math.max(1, width - 2);
    const clippedTitle =
      visibleWidth(title) > innerWidth ? truncateToWidth(title, innerWidth, '') : title;
    const dashCount = Math.max(0, innerWidth - visibleWidth(clippedTitle));
    return paint('╭') + clippedTitle + paint('─'.repeat(dashCount)) + paint('╮');
  }

  private renderBody(contentWidth: number): RenderedBody {
    const lines: string[] = [];
    lines.push(chalk.hex(currentTheme.palette.shellMode)(`& ${this.command}`));
    lines.push('');

    if (this.phase === 'running' && this.output.length === 0) {
      lines.push(chalk.hex(currentTheme.palette.textDim)('Running…'));
    } else if (this.output.length > 0) {
      lines.push(...new Text(this.output, 0, 0).render(contentWidth));
    }

    if (this.phase === 'failed' && this.error !== undefined) {
      if (lines[lines.length - 1] !== '') lines.push('');
      lines.push(
        ...new Text(chalk.hex(currentTheme.palette.error)(this.error), 0, 0).render(contentWidth),
      );
    }

    return this.fitBodyLines(lines);
  }

  private fitBodyLines(lines: string[]): RenderedBody {
    const bodyLimit = this.collapsedBodyLimit();
    const targetUncapped = Math.max(MIN_PANEL_LINES, lines.length);
    const target = bodyLimit === undefined ? targetUncapped : Math.min(bodyLimit, targetUncapped);

    if (lines.length > target) {
      this.maxScrollTop = lines.length - target;
      if (this.followTail) {
        this.scrollTop = this.maxScrollTop;
      } else {
        this.scrollTop = Math.min(this.scrollTop, this.maxScrollTop);
      }
      const start = this.scrollTop;
      return { lines: lines.slice(start, start + target), truncated: true };
    }

    this.followTail = true;
    this.scrollTop = 0;
    this.maxScrollTop = 0;
    const padded = [...lines];
    while (padded.length < target) {
      padded.push('');
    }
    return { lines: padded, truncated: false };
  }

  private collapsedBodyLimit(): number | undefined {
    const terminalRows = this.options.terminalRows();
    if (!Number.isFinite(terminalRows) || terminalRows <= 0) return undefined;
    return Math.max(1, Math.floor(terminalRows / 3) - 1);
  }

  private renderBodyLine(line: string, width: number): string {
    const paint = (s: string): string => chalk.hex(currentTheme.palette.border)(s);
    const contentWidth = Math.max(1, width - 4);
    const clipped =
      visibleWidth(line) > contentWidth ? truncateToWidth(line, contentWidth, '…') : line;
    const padding = Math.max(0, contentWidth - visibleWidth(clipped));
    return paint('│') + ' ' + clipped + ' '.repeat(padding) + ' ' + paint('│');
  }

  scroll(direction: 'up' | 'down'): boolean {
    if (this.maxScrollTop <= 0) return false;
    const current = this.followTail ? this.maxScrollTop : this.scrollTop;
    const next =
      direction === 'up'
        ? Math.max(0, current - 1)
        : Math.min(this.maxScrollTop, current + 1);
    this.scrollTop = next;
    this.followTail = next === this.maxScrollTop;
    return true;
  }
}

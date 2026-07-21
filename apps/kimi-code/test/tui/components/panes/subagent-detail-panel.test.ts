import { describe, expect, it } from 'vitest';

import { SubagentDetailPanelComponent } from '#/tui/components/panes/subagent-detail-panel';
import type { ToolCallSubagentDetail } from '#/tui/components/messages/tool-call';

function strip(text: string): string {
  return text.replaceAll(/\[[0-9;]*m/g, '');
}

function makeDetail(overrides: Partial<ToolCallSubagentDetail> = {}): ToolCallSubagentDetail {
  return {
    toolCallId: 'call-1',
    agentName: 'coder',
    description: 'Fix the bug',
    phase: 'done',
    thinkingText: 'let me think about this',
    text: 'the fix is straightforward',
    subCalls: [
      { name: 'Read', args: { path: '/a.ts' }, phase: 'done', output: 'file contents here' },
      { name: 'Edit', args: { path: '/a.ts' }, phase: 'done', isError: false },
    ],
    hiddenSubCallCount: 0,
    resultSummary: 'Fixed the bug in a.ts',
    errorText: undefined,
    tokens: 1234,
    ...overrides,
  };
}

function textOnlyDetail(text: string, toolCallId = 'call-1'): ToolCallSubagentDetail {
  return makeDetail({
    toolCallId,
    description: '',
    thinkingText: '',
    text,
    subCalls: [],
    hiddenSubCallCount: 0,
    resultSummary: undefined,
    errorText: undefined,
    tokens: 0,
  });
}

describe('SubagentDetailPanelComponent', () => {
  it('renders the agent name, position, and detail sections', () => {
    const panel = new SubagentDetailPanelComponent({ terminalRows: () => 40 });
    panel.setDetail(makeDetail(), { index: 2, total: 3 });

    const out = strip(panel.render(80).join('\n'));
    expect(out).toContain('AGENT coder 2/3');
    expect(out).toContain('Esc close');
    expect(out).toContain('✓ Completed');
    expect(out).toContain('Fix the bug');
    expect(out).toContain('let me think about this');
    expect(out).toContain('the fix is straightforward');
    expect(out).toContain('Read · /a.ts');
    expect(out).toContain('file contents here');
    expect(out).toContain('Fixed the bug in a.ts');
  });

  it('renders error output for a failed agent', () => {
    const panel = new SubagentDetailPanelComponent({ terminalRows: () => 40 });
    panel.setDetail(makeDetail({ phase: 'failed', errorText: 'boom' }), { index: 1, total: 1 });

    const out = strip(panel.render(80).join('\n'));
    expect(out).toContain('✗ Failed');
    expect(out).toContain('boom');
  });

  it('starts at the bottom and scrolls up away from the tail', () => {
    const panel = new SubagentDetailPanelComponent({ terminalRows: () => 14 });
    const longText = Array.from({ length: 40 }, (_, i) => `line ${String(i)}`).join('\n');
    panel.setDetail(textOnlyDetail(longText), { index: 1, total: 1 });

    const atBottom = strip(panel.render(80).join('\n'));
    expect(atBottom).toContain('↑↓ scroll');
    expect(atBottom).toContain('line 39'); // tail visible on open
    expect(atBottom).not.toContain('line 0');

    expect(panel.scroll('up')).toBe(true);
    const scrolledUp = strip(panel.render(80).join('\n'));
    expect(scrolledUp).not.toBe(atBottom);
    expect(scrolledUp).not.toContain('line 39');

    // Scrolling back down to the bottom re-arms tail-following.
    while (panel.scroll('down')) {
      /* drain to the bottom */
    }
    expect(strip(panel.render(80).join('\n'))).toContain('line 39');
  });

  it('keeps following the tail as a running agent grows', () => {
    const panel = new SubagentDetailPanelComponent({ terminalRows: () => 14 });
    const shortText = Array.from({ length: 40 }, (_, i) => `line ${String(i)}`).join('\n');
    panel.setDetail(textOnlyDetail(shortText), { index: 1, total: 1 });
    expect(strip(panel.render(80).join('\n'))).toContain('line 39');

    // Same agent, more output: still pinned to the new bottom.
    const longerText = Array.from({ length: 60 }, (_, i) => `line ${String(i)}`).join('\n');
    panel.setDetail(textOnlyDetail(longerText), { index: 1, total: 1 });
    expect(strip(panel.render(80).join('\n'))).toContain('line 59');
  });

  it('re-arms tail-following when switching agents', () => {
    const panel = new SubagentDetailPanelComponent({ terminalRows: () => 14 });
    const longText = Array.from({ length: 40 }, (_, i) => `line ${String(i)}`).join('\n');
    panel.setDetail(textOnlyDetail(longText), { index: 1, total: 2 });
    panel.scroll('up'); // leave the tail on agent 1

    panel.setDetail(textOnlyDetail(longText, 'call-2'), { index: 2, total: 2 });

    const out = strip(panel.render(80).join('\n'));
    expect(out).toContain('AGENT coder 2/2');
    expect(out).toContain('line 39'); // back at the bottom for the new agent
  });
});

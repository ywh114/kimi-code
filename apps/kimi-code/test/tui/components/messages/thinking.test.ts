import { visibleWidth, type TUI } from '@moonshot-ai/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { ThinkingComponent } from '#/tui/components/messages/thinking';
import { STATUS_BULLET } from '#/tui/constant/symbols';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

const longThinking = ['line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'].join('\n');

describe('ThinkingComponent', () => {
  it('shows a static bullet for expanded live thinking', () => {
    const component = new ThinkingComponent('working it out', true, 'live');
    const out = strip(component.render(80).join('\n'));

    // Short content auto-expands; use a static bullet (no braille spinner).
    expect(out).toContain(`${STATUS_BULLET}working it out`);
    expect(out).not.toContain('thinking...');
  });

  it('keeps live thinking height-limited to the tail', () => {
    const component = new ThinkingComponent(longThinking, true, 'live');
    const out = strip(component.render(80).join('\n'));

    expect(out).not.toContain('line1');
    expect(out).not.toContain('line4');
    expect(out).not.toContain('line5');
    expect(out).toContain('line6');
    expect(out).toContain('line7');
    expect(out).not.toContain('ctrl+o to expand');
  });

  it('animates the live spinner only while collapsed', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const component = new ThinkingComponent(longThinking, true, 'live', {
      requestRender,
    } as unknown as TUI);

    expect(strip(component.render(80).join('\n'))).toContain('| thinking...');

    vi.advanceTimersByTime(120);
    expect(requestRender).toHaveBeenCalled();
    expect(strip(component.render(80).join('\n'))).toContain('/ thinking...');

    component.finalize();
    requestRender.mockClear();
    vi.advanceTimersByTime(160);
    expect(requestRender).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not animate the spinner for expanded live thinking', () => {
    vi.useFakeTimers();
    const requestRender = vi.fn();
    const component = new ThinkingComponent('working it out', true, 'live', {
      requestRender,
    } as unknown as TUI);

    // Short content auto-expands.
    expect(strip(component.render(80).join('\n'))).not.toContain('thinking...');

    requestRender.mockClear();
    vi.advanceTimersByTime(200);
    expect(requestRender).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('finalizes in place into an always-expanded view', () => {
    const component = new ThinkingComponent(longThinking, true, 'live');

    component.finalize();

    const out = strip(component.render(80).join('\n'));
    expect(out).toContain('line1');
    expect(out).toContain('line2');
    expect(out).toContain('line7');
    expect(out).not.toContain('ctrl+e to expand');
  });

  it('keeps finalized thinking within the requested render width', () => {
    const component = new ThinkingComponent(longThinking, true, 'live');
    component.finalize();

    for (const line of component.render(37)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(37);
    }
  });

  it('has the same rendered height for expanded live and finalized thinking', () => {
    const component = new ThinkingComponent(longThinking, true, 'live');
    component.setExpanded(true);
    const liveHeight = component.render(80).length;

    component.finalize();
    const finalizedHeight = component.render(80).length;

    expect(finalizedHeight).toBe(liveHeight);
  });
});

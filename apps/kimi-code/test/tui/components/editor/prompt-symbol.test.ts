import { describe, it, expect } from 'vitest';

import { injectPromptSymbol } from '#/tui/components/editor/custom-editor';

describe('injectPromptSymbol', () => {
  it('places a "> " prompt at column 0 for a legacy 4-space padded line', () => {
    expect(injectPromptSymbol('    hello world')).toBe('> hello world');
  });

  it('places a "> " prompt at column 0 for the current 2-space padded line', () => {
    expect(injectPromptSymbol('  hello world')).toBe('> hello world');
  });

  it('prepends the prompt to non-padded lines', () => {
    expect(injectPromptSymbol('hello world')).toBe('> hello world');
  });

  it('preserves trailing ANSI escapes (e.g. cursor inverse marker)', () => {
    const line = '  [7m [0m         ';
    const out = injectPromptSymbol(line);
    expect(out).toBe('> [7m [0m         ');
  });

  it('emits no SGR on the symbol itself (terminal default foreground renders it)', () => {
    const out = injectPromptSymbol('  hello');
    expect(out).not.toMatch(/>.*\[/);
  });

  it('paints the bash "$" prompt through the provided color function', () => {
    const paint = (s: string): string => `<${s}>`;
    expect(injectPromptSymbol('  hi', '$', paint)).toBe('<$> hi');
  });

  it('paints the side-shell "&" prompt through the provided color function', () => {
    const paint = (s: string): string => `<${s}>`;
    expect(injectPromptSymbol('  hi', '&', paint)).toBe('<&> hi');
  });
});

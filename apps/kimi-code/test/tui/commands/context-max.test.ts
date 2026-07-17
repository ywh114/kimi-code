import { describe, expect, it, vi } from 'vitest';

import { handleContextMaxCommand, parseContextMaxTokens } from '#/tui/commands/config';
import type { SlashCommandHost } from '#/tui/commands/index';

const ALIAS = 'kimi/kimi-k3';
const BASE_MAX = 1_048_576;

interface HostOptions {
  streaming?: boolean;
  session?: boolean;
  currentMax?: number;
  aliasOverrides?: Record<string, unknown>;
}

function makeHost(options: HostOptions = {}) {
  const setConfig = vi.fn(async () => ({}));
  const getStatus = vi.fn(async () => ({
    model: ALIAS,
    thinkingEffort: 'off',
    permission: 'manual',
    planMode: false,
    swarmMode: false,
    contextTokens: 12_000,
    maxContextTokens: 256_000,
    contextUsage: 12_000 / 256_000,
  }));
  const host = {
    state: {
      appState: {
        model: ALIAS,
        availableModels: {
          [ALIAS]: {
            provider: 'kimi',
            model: 'kimi-k3',
            maxContextSize: BASE_MAX,
            ...(options.aliasOverrides !== undefined
              ? { overrides: options.aliasOverrides }
              : {}),
          },
        },
        availableProviders: { kimi: { type: 'openai' } },
        maxContextTokens: options.currentMax ?? BASE_MAX,
        streamingPhase: options.streaming === true ? 'waiting' : 'idle',
      },
    },
    session: options.session === false ? undefined : { getStatus },
    harness: { setConfig },
    showError: vi.fn(),
    showStatus: vi.fn(),
    setAppState: vi.fn(),
  } as unknown as SlashCommandHost;
  return {
    host,
    setConfig,
    getStatus,
    showError: host.showError as unknown as ReturnType<typeof vi.fn>,
    showStatus: host.showStatus as unknown as ReturnType<typeof vi.fn>,
    setAppState: host.setAppState as unknown as ReturnType<typeof vi.fn>,
  };
}

describe('parseContextMaxTokens', () => {
  it('parses plain numbers', () => {
    expect(parseContextMaxTokens('262144')).toBe(262_144);
  });

  it('parses k / M suffixes case-insensitively', () => {
    expect(parseContextMaxTokens('256k')).toBe(256_000);
    expect(parseContextMaxTokens('256K')).toBe(256_000);
    expect(parseContextMaxTokens('1M')).toBe(1_000_000);
    expect(parseContextMaxTokens('1m')).toBe(1_000_000);
    expect(parseContextMaxTokens('0.5M')).toBe(500_000);
  });

  it('rejects garbage', () => {
    expect(parseContextMaxTokens('')).toBeUndefined();
    expect(parseContextMaxTokens('abc')).toBeUndefined();
    expect(parseContextMaxTokens('10kb')).toBeUndefined();
    expect(parseContextMaxTokens('1.2.3')).toBeUndefined();
  });
});

describe('handleContextMaxCommand', () => {
  it('shows the current cap when no argument is given', async () => {
    const { host, showStatus } = makeHost({ currentMax: BASE_MAX });
    await handleContextMaxCommand(host, '');
    expect(showStatus).toHaveBeenCalledOnce();
    const [msg] = showStatus.mock.calls[0] as [string];
    expect(msg).toContain('1.0M');
    expect(msg).toContain('/context-max <tokens|reset>');
  });

  it('errors when no model is selected', async () => {
    const { host, showError } = makeHost();
    (host.state.appState as { model: string }).model = 'missing';
    await handleContextMaxCommand(host, '256k');
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('No model selected'));
  });

  it('rejects invalid arguments', async () => {
    const { host, showError, setConfig } = makeHost();
    await handleContextMaxCommand(host, 'banana');
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Invalid context max'));
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('rejects values below the minimum', async () => {
    const { host, showError, setConfig } = makeHost();
    await handleContextMaxCommand(host, '32k');
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('at least'));
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('blocks while streaming', async () => {
    const { host, showError, setConfig } = makeHost({ streaming: true });
    await handleContextMaxCommand(host, '256k');
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('Ctrl-C'));
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('sets a cap, persists it, and refreshes the gauge from session status', async () => {
    const { host, setConfig, getStatus, setAppState, showStatus } = makeHost();
    await handleContextMaxCommand(host, '256k');

    expect(setConfig).toHaveBeenCalledWith({
      models: {
        [ALIAS]: {
          provider: 'kimi',
          model: 'kimi-k3',
          maxContextSize: BASE_MAX,
          overrides: { maxContextSize: 256_000 },
        },
      },
    });
    expect(getStatus).toHaveBeenCalledOnce();
    expect(setAppState).toHaveBeenCalledWith({
      maxContextTokens: 256_000,
      contextTokens: 12_000,
      contextUsage: 12_000 / 256_000,
    });
    const [msg, color] = showStatus.mock.calls[0] as [string, string];
    expect(msg).toContain('256.0k');
    expect(color).toBe('success');
  });

  it('merges with existing alias overrides instead of replacing them', async () => {
    const { host, setConfig } = makeHost({ aliasOverrides: { displayName: 'K3' } });
    await handleContextMaxCommand(host, '256k');
    expect(setConfig).toHaveBeenCalledWith({
      models: {
        [ALIAS]: expect.objectContaining({
          overrides: { displayName: 'K3', maxContextSize: 256_000 },
        }),
      },
    });
  });

  it('clamps values above the model context window', async () => {
    const { host, setConfig, showStatus } = makeHost();
    await handleContextMaxCommand(host, '2M');
    expect(setConfig).toHaveBeenCalledWith({
      models: {
        [ALIAS]: expect.objectContaining({
          overrides: { maxContextSize: BASE_MAX },
        }),
      },
    });
    const [msg] = showStatus.mock.calls[0] as [string];
    expect(msg).toContain('Clamped');
  });

  it('resets to the model default', async () => {
    const { host, setConfig, showStatus } = makeHost({ currentMax: 256_000 });
    await handleContextMaxCommand(host, 'reset');
    expect(setConfig).toHaveBeenCalledWith({
      models: {
        [ALIAS]: expect.objectContaining({
          overrides: { maxContextSize: BASE_MAX },
        }),
      },
    });
    const [msg] = showStatus.mock.calls[0] as [string];
    expect(msg).toContain('1.0M');
  });

  it('still persists when there is no active session', async () => {
    const { host, setConfig, getStatus, showStatus } = makeHost({ session: false });
    await handleContextMaxCommand(host, '256k');
    expect(setConfig).toHaveBeenCalledOnce();
    expect(getStatus).not.toHaveBeenCalled();
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('256.0k'), 'success');
  });
});

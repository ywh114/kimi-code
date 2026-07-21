import { describe, expect, it, vi } from 'vitest';

import { Container } from '@moonshot-ai/pi-tui';

import { AgentGroupComponent } from '#/tui/components/messages/agent-group';
import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import type { ToolCallBlockData } from '#/tui/types';
import { SubagentDetailController } from '#/tui/controllers/subagent-detail';
import type { TUIState } from '#/tui/tui-state';

function agentCard(id: string, description: string): ToolCallComponent {
  const toolCall: ToolCallBlockData = {
    id,
    name: 'Agent',
    args: { description },
    subagent: { id: `agent-${id}`, text: `text of ${id}`, toolCalls: [] },
  };
  return new ToolCallComponent(toolCall, undefined, undefined);
}

function nonAgentCard(id: string): ToolCallComponent {
  return new ToolCallComponent({ id, name: 'Read', args: { path: '/x' } }, undefined, undefined);
}

function makeHost(children: unknown[]): {
  state: TUIState;
  transcript: Container;
  panel: Container;
} {
  const transcript = new Container();
  for (const child of children) {
    transcript.addChild(child as ToolCallComponent);
  }
  const panel = new Container();
  const state = {
    transcriptContainer: transcript,
    subagentPanelContainer: panel,
    terminal: { rows: 40 },
    ui: { requestRender: vi.fn() },
  } as unknown as TUIState;
  return { state, transcript, panel };
}

describe('SubagentDetailController', () => {
  it('opens at the latest agent card and mounts the panel', () => {
    const { state, panel } = makeHost([agentCard('c1', 'first'), agentCard('c2', 'second')]);
    const controller = new SubagentDetailController({ state });

    controller.open(1);

    expect(controller.isOpen()).toBe(true);
    expect(panel.children.length).toBe(1);
    controller.clear();
  });

  it('does nothing when there are no agent cards', () => {
    const { state, panel } = makeHost([nonAgentCard('r1')]);
    const controller = new SubagentDetailController({ state });

    controller.open(1);

    expect(controller.isOpen()).toBe(false);
    expect(panel.children.length).toBe(0);
  });

  it('walks the flat list with open/cycle, clamped at the ends', () => {
    const { state } = makeHost([agentCard('c1', 'first'), agentCard('c2', 'second')]);
    const controller = new SubagentDetailController({ state });

    controller.open(1); // at c2
    expect(controller.cycle(-1)).toBe(true); // to c1
    expect(controller.cycle(-1)).toBe(true); // clamped at c1
    expect(controller.cycle(1)).toBe(true); // back to c2
    expect(controller.cycle(1)).toBe(true); // clamped at c2
    controller.clear();
  });

  it('discovers swarm members hidden inside an AgentGroupComponent', () => {
    const group = new AgentGroupComponent(undefined);
    group.attach('g1', agentCard('g1', 'swarm one'));
    group.attach('g2', agentCard('g2', 'swarm two'));
    const { state } = makeHost([agentCard('solo', 'standalone'), group]);
    const controller = new SubagentDetailController({ state });

    controller.open(1);

    // solo + 2 group members = 3 entries; opened at the last (g2)
    const active = controller as unknown as {
      active: { entries: ToolCallComponent[]; index: number };
    };
    expect(active.active.entries).toHaveLength(3);
    expect(active.active.index).toBe(2);

    // ←/→ moves through the group members (parallel subagents)
    controller.cycle(-1);
    expect(active.active.index).toBe(1);
    controller.cycle(-1);
    expect(active.active.index).toBe(0);
    controller.clear();
  });

  it('close() unmounts the panel and makes cycle a no-op', () => {
    const { state, panel } = makeHost([agentCard('c1', 'first')]);
    const controller = new SubagentDetailController({ state });

    controller.open(1);
    expect(controller.close()).toBe(true);
    expect(controller.isOpen()).toBe(false);
    expect(panel.children.length).toBe(0);
    expect(controller.cycle(1)).toBe(false);
    expect(controller.close()).toBe(false);
  });
});

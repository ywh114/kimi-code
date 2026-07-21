import { AgentGroupComponent } from '../components/messages/agent-group';
import { ToolCallComponent } from '../components/messages/tool-call';
import { SubagentDetailPanelComponent } from '../components/panes/subagent-detail-panel';
import type { TUIState } from '../tui-state';

const REFRESH_INTERVAL_MS = 500;

export interface SubagentDetailHost {
  state: TUIState;
}

/**
 * Subagent detail panel (opencode-style child view). Ctrl+↓ opens the latest
 * agent card; Ctrl+↑/↓ and ←/→ walk the flat, chronologically ordered list of
 * agent cards — standalone Agent cards and AgentGroup (swarm) members, which
 * sit adjacently, so ←/→ naturally cycles parallel subagents. Esc / Ctrl+C
 * closes it. While open the panel is re-polled periodically so a running
 * subagent's detail stays live.
 */
export class SubagentDetailController {
  private active:
    | {
        readonly panel: SubagentDetailPanelComponent;
        entries: readonly ToolCallComponent[];
        index: number;
        readonly refreshTimer: ReturnType<typeof setInterval>;
      }
    | undefined;

  constructor(private readonly host: SubagentDetailHost) {}

  isOpen(): boolean {
    return this.active !== undefined;
  }

  /** Ctrl+↓ / Ctrl+↑. Opens the panel (at the latest agent) or steps ±1. */
  open(direction: 1 | -1): void {
    if (this.active !== undefined) {
      this.move(direction);
      return;
    }
    const entries = this.collectAgentComponents();
    if (entries.length === 0) return;
    const panel = new SubagentDetailPanelComponent({
      terminalRows: () => this.host.state.terminal.rows,
    });
    this.active = {
      panel,
      entries,
      index: entries.length - 1,
      refreshTimer: setInterval(() => {
        this.refresh();
      }, REFRESH_INTERVAL_MS),
    };
    this.host.state.subagentPanelContainer.clear();
    this.host.state.subagentPanelContainer.addChild(panel);
    this.refreshDetail();
    this.host.state.ui.requestRender();
  }

  /** ←/→ while open. Returns false when the panel is closed. */
  cycle(direction: 1 | -1): boolean {
    if (this.active === undefined) return false;
    this.move(direction);
    return true;
  }

  scroll(direction: 'up' | 'down'): boolean {
    const active = this.active;
    if (active === undefined || !active.panel.scroll(direction)) return false;
    this.host.state.ui.requestRender();
    return true;
  }

  /** Esc / Ctrl+C. Returns true when the panel was open and is now closed. */
  close(): boolean {
    if (this.active === undefined) return false;
    this.clear();
    return true;
  }

  clear(): void {
    const active = this.active;
    if (active !== undefined) {
      clearInterval(active.refreshTimer);
    }
    this.active = undefined;
    this.host.state.subagentPanelContainer.clear();
  }

  private move(direction: 1 | -1): void {
    const active = this.active;
    if (active === undefined) return;
    const next = Math.max(0, Math.min(active.entries.length - 1, active.index + direction));
    if (next === active.index) return;
    active.index = next;
    this.refreshDetail();
    this.host.state.ui.requestRender();
  }

  private refresh(): void {
    const active = this.active;
    if (active === undefined) return;
    // Re-enumerate so newly spawned agents appear; keep selection by id.
    const currentId = active.entries[active.index]?.toolCallView.id;
    const entries = this.collectAgentComponents();
    if (entries.length === 0) {
      this.clear();
      this.host.state.ui.requestRender();
      return;
    }
    active.entries = entries;
    const newIndex = entries.findIndex((tc) => tc.toolCallView.id === currentId);
    active.index = newIndex >= 0 ? newIndex : entries.length - 1;
    this.refreshDetail();
    this.host.state.ui.requestRender();
  }

  private refreshDetail(): void {
    const active = this.active;
    if (active === undefined) return;
    const tc = active.entries[active.index];
    const detail = tc?.getSubagentDetail();
    if (detail === undefined) return;
    active.panel.setDetail(detail, { index: active.index + 1, total: active.entries.length });
  }

  /**
   * Flat, chronologically ordered agent cards: standalone ToolCallComponents
   * plus AgentGroup members (which are hidden inside the group, so a plain
   * child walk cannot find them).
   */
  private collectAgentComponents(): ToolCallComponent[] {
    const out: ToolCallComponent[] = [];
    for (const child of this.host.state.transcriptContainer.children) {
      if (child instanceof AgentGroupComponent) {
        for (const tc of child.getToolComponents()) {
          if (tc.getSubagentDetail() !== undefined) out.push(tc);
        }
      } else if (child instanceof ToolCallComponent) {
        if (child.getSubagentDetail() !== undefined) out.push(child);
      }
    }
    return out;
  }
}

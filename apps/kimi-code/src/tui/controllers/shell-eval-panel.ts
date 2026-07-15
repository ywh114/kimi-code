/**
 * Controller for the `!!` shell-eval side panel.
 *
 * Runs the command directly through the session's Bash tool (the same path as
 * a foreground `!` command, but without involving the LLM). Output is shown in
 * a dedicated panel above the editor so it runs concurrently with the main turn.
 */

import type { Session } from '@moonshot-ai/kimi-code-sdk';

import { ShellEvalPanelComponent } from '../components/panes/shell-eval-panel';
import { NO_ACTIVE_SESSION_MESSAGE } from '../constant/kimi-tui';
import { formatErrorMessage } from '../utils/event-payload';
import { nextTranscriptId } from '../utils/transcript-id';
import type { TUIState } from '../tui-state';

export interface ShellEvalPanelHost {
  state: TUIState;
  session: Session | undefined;

  showError(msg: string): void;
}

export class ShellEvalPanelController {
  private active:
    | {
        readonly commandId: string;
        readonly panel: ShellEvalPanelComponent;
      }
    | undefined;
  private readonly panelsByCommandId = new Map<string, ShellEvalPanelComponent>();
  private readonly receivedOutputByCommandId = new Map<string, boolean>();

  constructor(private readonly host: ShellEvalPanelHost) {}

  async run(command: string): Promise<void> {
    const session = this.host.session;
    if (session === undefined) {
      this.host.showError(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }

    this.closeActive();

    const commandId = nextTranscriptId();
    const panel = new ShellEvalPanelComponent({
      terminalRows: () => this.host.state.terminal.rows,
      onClose: () => this.closeActive(),
    });
    panel.setCommand(command);
    this.mount(panel);

    this.active = { commandId, panel };
    this.panelsByCommandId.set(commandId, panel);

    void session
      .runShellCommand(command, { commandId })
      .then(
        ({ stdout, stderr, isError }) => {
          if (!this.receivedOutputByCommandId.get(commandId)) {
            if (stdout.length > 0) panel.appendOutput(stdout);
            if (stderr.length > 0) panel.appendOutput(stderr);
          }
          if (isError) {
            panel.markFailed('Command exited with an error.');
          } else {
            panel.markDone();
          }
          this.host.state.ui.requestRender();
        },
        (error: unknown) => {
          panel.markFailed(formatErrorMessage(error));
          this.host.state.ui.requestRender();
        },
      );
  }

  handleOutput(commandId: string, update: { kind: string; text?: string }): boolean {
    const panel = this.panelsByCommandId.get(commandId);
    if (panel === undefined) return false;
    const text = update.text ?? '';
    if (text.length > 0) {
      this.receivedOutputByCommandId.set(commandId, true);
      panel.appendOutput(text);
      this.host.state.ui.requestRender();
    }
    return true;
  }

  handleStarted(commandId: string): boolean {
    return this.panelsByCommandId.has(commandId);
  }

  closeOrCancel(): boolean {
    if (this.active === undefined) return false;
    this.closeActive();
    return true;
  }

  cancelRunning(): boolean {
    const active = this.active;
    if (active === undefined || !active.panel.isRunning()) return false;
    const session = this.host.session;
    if (session === undefined) return false;
    void session.cancelShellCommand(active.commandId).catch((error: unknown) => {
      this.host.showError(`Failed to cancel shell-eval: ${formatErrorMessage(error)}`);
    });
    return true;
  }

  scroll(direction: 'up' | 'down'): boolean {
    const handled = this.active?.panel.scroll(direction) ?? false;
    if (handled) this.host.state.ui.requestRender();
    return handled;
  }

  clear(): void {
    this.cancelRunning();
    this.active = undefined;
    this.panelsByCommandId.clear();
    this.receivedOutputByCommandId.clear();
    this.host.state.shellEvalPanelContainer.clear();
    this.host.state.editor.connectedAbove = false;
  }

  private cleanup(commandId: string): void {
    if (this.active?.commandId === commandId) {
      this.active = undefined;
    }
    this.panelsByCommandId.delete(commandId);
    this.receivedOutputByCommandId.delete(commandId);
  }

  private closeActive(): void {
    const active = this.active;
    if (active === undefined) return;
    void this.host.session?.cancelShellCommand(active.commandId).catch(() => {
      // Best-effort cancellation when the user closes the panel.
    });
    this.cleanup(active.commandId);
    this.host.state.shellEvalPanelContainer.clear();
    this.host.state.editor.connectedAbove = false;
    this.host.state.ui.requestRender(true);
  }

  private mount(panel: ShellEvalPanelComponent): void {
    this.host.state.shellEvalPanelContainer.clear();
    this.host.state.shellEvalPanelContainer.addChild(panel);
    this.host.state.editor.connectedAbove = true;
    this.host.state.ui.setFocus(this.host.state.editor);
    this.host.state.ui.requestRender();
  }
}

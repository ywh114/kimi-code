# Fork Patches

Short log of patches applied on top of upstream `kimi-code`.

| Patch | Description | Files |
|-------|-------------|-------|
| Remove tips | Disabled rotating toolbar tips above the input box and tips next to the streaming spinner. | `src/tui/components/chrome/footer.ts`, `src/tui/components/chrome/header.ts` |
| Live-thinking expansion (Ctrl+Y) | `Ctrl+Y` expands/collapses reasoning while it is streaming; finalized blocks are unaffected. Expanded live thinking uses a static bullet instead of the animated Braille spinner to stop flashing. `Ctrl+E` is left free for end-of-line. | `src/tui/components/messages/thinking.ts`, `src/tui/components/editor/custom-editor.ts`, `src/tui/components/dialogs/help-panel.ts` |
| Finalize thinking before tool calls | Live thinking blocks are finalized before a tool call renders, so tool output updates do not fight with expanded thinking. | `src/tui/controllers/session-event-handler.ts` |
| Footer badges | Added `xtool` and `xthink` indicators next to `yolo`/`plan`. | `src/tui/types.ts`, `src/tui/kimi-tui.ts`, `src/tui/controllers/streaming-ui.ts`, `src/tui/components/chrome/footer.ts` |
| Symbols / spinners | Status bullet changed from `●` to legacy `•`. Braille/moon spinners replaced with ASCII `| / - \\` to avoid missing-glyph boxes. | `src/tui/constant/symbols.ts`, `src/tui/constant/rendering.ts` |
| Sticky shell mode (`Ctrl+X`) | `Ctrl+X` toggles bash mode; submits stay in shell mode until toggled off. | `src/tui/controllers/editor-keyboard.ts`, `src/tui/components/editor/custom-editor.ts` |
| Bash prompt symbol | Bash-mode prompt changed from `!` to `$`. | `src/tui/components/editor/custom-editor.ts` |
| `!!` direct shell eval | `!!<cmd>` runs Bash directly via `session.runShellCommand`, streams output to a `SHELL` panel, prompt shows `&`, output is deduplicated, and `Esc` closes the panel. | `src/tui/components/editor/custom-editor.ts`, `src/tui/kimi-tui.ts`, `src/tui/controllers/shell-eval-panel.ts`, `src/tui/components/panes/shell-eval-panel.ts` |
| `/help` shortcuts | Added `Ctrl+Y` (live thinking) and `Ctrl+X` (shell mode) to the `/help` keyboard list, and corrected the `Esc` description. | `src/tui/components/dialogs/help-panel.ts` |
| `Esc` vs `Ctrl-C` | `Esc` only closes dialogs/panels and double-tap undo; it no longer cancels streaming/compaction/`/init`. `Ctrl-C` handles all interruption. | `src/tui/controllers/editor-keyboard.ts` |
| Tests | Updated tests for the above changes. | `test/tui/controllers/editor-keyboard.test.ts`, `test/tui/kimi-tui-message-flow.test.ts`, `test/tui/components/editor/custom-editor.test.ts` |

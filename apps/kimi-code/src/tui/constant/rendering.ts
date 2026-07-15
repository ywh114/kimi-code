// Continuation indent for transcript rows that use a two-cell leading marker.
export const MESSAGE_INDENT = '  ';

// Outer left/right padding applied to the transcript, panels, and the
// statusline. Set to 0 so the chrome spans the full terminal width and
// matches the flat, full-width input strip.
export const CHROME_GUTTER = 0;

// Shared preview caps used by thinking, tool results, and shell snippets.
export const RESULT_PREVIEW_LINES = 3;
export const THINKING_PREVIEW_LINES = 2;
export const COMMAND_PREVIEW_LINES = 10;

// Animation frames are shared by the login/update loaders and live thinking.
// ASCII spinners avoid missing-glyph boxes on terminals without emoji/Braille
// fonts (e.g. DejaVu Sans Mono + Nerd Fonts but no Noto Color Emoji).
export const BRAILLE_SPINNER_FRAMES = ['|', '/', '-', '\\'];
export const BRAILLE_SPINNER_INTERVAL_MS = 120;

export const MOON_SPINNER_FRAMES = ['|', '/', '-', '\\'];
export const MOON_SPINNER_INTERVAL_MS = 120;

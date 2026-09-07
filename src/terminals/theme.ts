import type { ITheme } from "@xterm/xterm";

/**
 * xterm palette. The eight base colours are the ones the design uses for
 * terminal output (TerminalPane.dc.html `C`), extended into a full ANSI set so
 * real programs still look right. The background stays transparent: the frosted
 * pane behind the terminal is what the design shows through.
 */
export const TERMINAL_THEME: ITheme = {
  background: "rgba(0, 0, 0, 0)",
  foreground: "#e6e9f0",
  cursor: "#8ddcff",
  cursorAccent: "#07080d",
  selectionBackground: "rgba(141, 220, 255, 0.28)",
  selectionInactiveBackground: "rgba(255, 255, 255, 0.12)",

  black: "#1a1d29",
  red: "#ff8a8a",
  green: "#7fe0a8",
  yellow: "#f0b64a",
  blue: "#8ddcff",
  magenta: "#c8b6ff",
  cyan: "#8ddcff",
  white: "#e6e9f0",

  brightBlack: "rgba(230, 233, 240, 0.5)",
  brightRed: "#ffa8a8",
  brightGreen: "#a9f0c8",
  brightYellow: "#ffd88a",
  brightBlue: "#b6e8ff",
  brightMagenta: "#ddd0ff",
  brightCyan: "#dff4ff",
  brightWhite: "#ffffff",
};

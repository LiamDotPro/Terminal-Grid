import type { ITheme } from "@xterm/xterm";

/** The theme actually on screen once "system" is resolved. */
export type ResolvedTheme = "light" | "dark" | "black" | "glass";

/**
 * xterm palette. The eight base colours are the ones the design uses for
 * terminal output (TerminalPane.dc.html `C`), extended into a full ANSI set so
 * real programs still look right. The background stays transparent: the frosted
 * pane behind the terminal is what the design shows through.
 *
 * Its colour channels are still the glass's own colour, because xterm checks
 * text contrast against them (minimumContrastRatio in the registry): against
 * the real backdrop, not against black.
 */
export const TERMINAL_THEME: ITheme = {
  background: "rgba(8, 10, 18, 0)",
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

/**
 * Light counterpart: the same hues, deepened until they read on the pale
 * glass. "white" maps to a dark grey because programs use it for normal text.
 */
export const TERMINAL_THEME_LIGHT: ITheme = {
  background: "rgba(246, 247, 251, 0)",
  foreground: "#1f2433",
  cursor: "#0c78b2",
  cursorAccent: "#ffffff",
  selectionBackground: "rgba(12, 120, 178, 0.22)",
  selectionInactiveBackground: "rgba(24, 30, 52, 0.1)",

  black: "#1f2433",
  red: "#c93636",
  green: "#16965c",
  yellow: "#a86a00",
  blue: "#0c78b2",
  magenta: "#6a4fd6",
  cyan: "#0a7f8f",
  white: "#4a5165",

  brightBlack: "rgba(31, 36, 51, 0.55)",
  brightRed: "#e04848",
  brightGreen: "#1aa868",
  brightYellow: "#be7800",
  brightBlue: "#1a8fd0",
  brightMagenta: "#8064e6",
  brightCyan: "#0e96a8",
  brightWhite: "#05070d",
};

export function terminalTheme(theme: ResolvedTheme): ITheme {
  return theme === "light" ? TERMINAL_THEME_LIGHT : TERMINAL_THEME;
}

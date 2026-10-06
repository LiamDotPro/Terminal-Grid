import { useEffect, useState } from "react";
import type { ThemePreference } from "../ipc/types";
import { terminalRegistry } from "../terminals/registry";
import type { ResolvedTheme } from "../terminals/theme";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

/** "system" becomes light or dark from the OS; the others are taken as chosen. */
export function resolveTheme(preference: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersLight ? "light" : "dark";
  return preference;
}

function useSystemPrefersLight(): boolean {
  const [light, setLight] = useState(() => window.matchMedia?.(LIGHT_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(LIGHT_QUERY);
    if (!query) return;
    const onChange = () => setLight(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return light;
}

/**
 * Puts the theme and layout on <html> (data-theme, data-layout), where the
 * tokens in styles/tokens.css pick them up, and repaints the terminals. While
 * the preference is "system" it follows the OS as it changes.
 */
export function useAppearance(preference: ThemePreference, compact: boolean): void {
  const systemPrefersLight = useSystemPrefersLight();
  const theme = resolveTheme(preference, systemPrefersLight);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    terminalRegistry.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.layout = compact ? "compact" : "comfortable";
  }, [compact]);
}

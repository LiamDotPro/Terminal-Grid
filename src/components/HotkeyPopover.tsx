import { useEffect, useRef } from "react";
import { hotkeyHints, modifierLabel } from "../lib/hotkeys";
import { useSolePopover } from "../lib/popover";
import { useAppActions, useHotkeyScheme } from "../state/AppProvider";

/** The hotkey cheat sheet from screen 1d. Dismisses on Escape or a click outside. */
export function HotkeyPopover() {
  const scheme = useHotkeyScheme();
  const actions = useAppActions();
  const root = useRef<HTMLDivElement>(null);
  // Mounted only while open.
  useSolePopover(true, () => actions.setHotkeysOpen(false));

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      // The chrome's ? button owns the toggle; let its own handler run.
      if (target?.closest("[data-hotkeys-toggle]")) return;
      if (!root.current?.contains(target)) actions.setHotkeysOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") actions.setHotkeysOpen(false);
    };
    // Capture so a click on the chrome's ? button still toggles it closed.
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actions]);

  return (
    <div className="hotkeys" ref={root} role="dialog" aria-label="Hotkeys">
      <div className="hotkeys__head">
        <span className="hotkeys__title">Hotkeys</span>
        <span className="hotkeys__mod">{modifierLabel(scheme)}</span>
      </div>
      {hotkeyHints(scheme).map((hint) => (
        <div className="hotkeys__row" key={hint.label}>
          <span className="hotkeys__label">{hint.label}</span>
          <span className="kbd">{hint.key}</span>
        </div>
      ))}
    </div>
  );
}

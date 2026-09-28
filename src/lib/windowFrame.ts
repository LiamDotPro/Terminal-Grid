import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * How the frameless window is currently sitting. With no native decorations
 * the three states look alike, so the chrome reads this to show which one the
 * user is in (and only a "windowed" window can be resized from its edges).
 */
export type WindowFrame = "fullscreen" | "maximized" | "windowed";

/** Tracks the window frame state; fullscreen and maximize both fire a resize. */
export function useWindowFrame(): WindowFrame {
  const [frame, setFrame] = useState<WindowFrame>("fullscreen");

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let disposed = false;

    const refresh = async () => {
      const [fullscreen, maximized] = await Promise.all([
        appWindow.isFullscreen(),
        appWindow.isMaximized(),
      ]);
      if (!disposed) setFrame(fullscreen ? "fullscreen" : maximized ? "maximized" : "windowed");
    };

    void refresh();
    const unlisten = appWindow.onResized(() => void refresh());
    return () => {
      disposed = true;
      void unlisten.then((stop) => stop());
    };
  }, []);

  return frame;
}

import { useEffect, useRef } from "react";
import type { TerminalId } from "../ipc/types";
import { terminalRegistry } from "../terminals/registry";

/**
 * Slot for a session's xterm element. The element itself is owned by the
 * registry, so re-parenting this component (a page switch, a reorder) moves the
 * live terminal instead of tearing it down.
 */
export function XtermSurface({ id }: { id: TerminalId }) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = slot.current;
    if (node) terminalRegistry.attach(id, node);
  }, [id]);

  return <div className="pane__surface" ref={slot} />;
}

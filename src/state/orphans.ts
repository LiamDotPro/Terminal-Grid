import { call } from "../ipc/client";
import type { TerminalId } from "../ipc/types";

/**
 * Closes the core's terminals that no pane owns and returns their ids.
 *
 * The core outlives the page: a webview reload starts a frontend with no panes
 * while the previous page's shells keep running, and nothing would ever close
 * them. On Windows those shells also hang at startup, because nobody answers
 * ConPTY's cursor-position query.
 */
export async function closeUnownedTerminals(owned: ReadonlySet<TerminalId>): Promise<TerminalId[]> {
  const orphans = (await call("list_terminals", {}))
    .map((info) => info.id)
    .filter((id) => !owned.has(id));
  // One shell that refuses to close must not keep the others alive.
  await Promise.allSettled(orphans.map((id) => call("close_terminal", { id })));
  return orphans;
}

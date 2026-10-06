import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalInfo } from "../ipc/types";

const backend = vi.hoisted(() => ({
  terminals: [] as string[],
  closed: [] as string[],
  failClose: new Set<string>(),
}));

vi.mock("../ipc/client", () => ({
  call: vi.fn(async (name: string, args: { id?: string }) => {
    if (name === "list_terminals") {
      return backend.terminals.map(
        (id): TerminalInfo => ({ id, cwd: "C:/dev", shell: "pwsh", shellPid: 1, exited: false, exitCode: null }),
      );
    }
    if (name === "close_terminal" && args.id) {
      if (backend.failClose.has(args.id)) throw new Error(`cannot close ${args.id}`);
      backend.closed.push(args.id);
      backend.terminals = backend.terminals.filter((id) => id !== args.id);
      return;
    }
    throw new Error(`unexpected command ${name}`);
  }),
}));

const { closeUnownedTerminals } = await import("./orphans");

beforeEach(() => {
  backend.terminals = [];
  backend.closed = [];
  backend.failClose = new Set();
});

describe("closeUnownedTerminals", () => {
  it("closes every terminal left over from an earlier page load", async () => {
    backend.terminals = ["a", "b", "c"];
    await expect(closeUnownedTerminals(new Set())).resolves.toEqual(["a", "b", "c"]);
    expect(backend.closed).toEqual(["a", "b", "c"]);
    expect(backend.terminals).toEqual([]);
  });

  it("keeps the terminals a pane owns", async () => {
    backend.terminals = ["a", "b", "c"];
    await expect(closeUnownedTerminals(new Set(["b"]))).resolves.toEqual(["a", "c"]);
    expect(backend.terminals).toEqual(["b"]);
  });

  it("still closes the rest when one close fails", async () => {
    backend.terminals = ["a", "b", "c"];
    backend.failClose = new Set(["a"]);
    await expect(closeUnownedTerminals(new Set())).resolves.toEqual(["a", "b", "c"]);
    expect(backend.closed).toEqual(["b", "c"]);
  });

  it("does nothing when the core has no terminals", async () => {
    await expect(closeUnownedTerminals(new Set())).resolves.toEqual([]);
    expect(backend.closed).toEqual([]);
  });
});

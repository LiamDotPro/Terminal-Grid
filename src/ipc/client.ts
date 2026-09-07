import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Commands, CommandName, EVENTS } from "./types";

// Typed wrapper around invoke. Errors arrive as AppError objects (see types.ts).
export function call<K extends CommandName>(name: K, args: Commands[K]["in"]): Promise<Commands[K]["out"]> {
  return invoke<Commands[K]["out"]>(name, args as Record<string, unknown>);
}

export function on<T>(event: (typeof EVENTS)[keyof typeof EVENTS], handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

export function decodeB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

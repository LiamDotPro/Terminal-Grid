# Terminal Grid

Desktop terminal grid built on Tauri 2 (Rust) with a Notes tab for markdown.

- Design doc: `docs/technical-design.md`
- IPC contract shared by both sides: `src/ipc/types.ts`
- Shell integration script bundled with the app: `src-tauri/resources/shell-integration.ps1`

## Prerequisites (Windows)

- Rust stable with the MSVC toolchain (`rustup default stable-msvc`)
- Visual Studio Build Tools with the "Desktop development with C++" workload
- Node 22
- Git on PATH

## Run

```
npm install
npm run tauri dev
```

The window is frameless and starts fullscreen; the 44px bar at the top is the
app's own chrome, and it is the drag region. `F11` toggles fullscreen.

## Build installer

```
npm run tauri build
```

## Test

```
npm test                 # frontend: layout, hotkeys, OSC parsing, markdown, reducer
cd src-tauri && cargo test   # core: worktree parser, path sandbox, agent state, coalescer
```

## Layout

```
docs/                    design docs
src/                     frontend (Vite + React 19 + xterm.js)
  ipc/                   the IPC contract and typed client — the boundary
  state/                 reducer, view models, the provider that talks to Rust
  terminals/             xterm instance registry, theme, OSC parsing
  components/            chrome, pane grid, notes, settings
  styles/                design tokens and component CSS
src-tauri/               Rust core, see docs/technical-design.md section 2
```

## Hotkeys

The modifier is `Ctrl+Alt` by default and can be switched to `Ctrl+Shift` in
Settings (AltGr layouts make `Ctrl+Alt` awkward on some keyboards).

| Keys | Action |
|---|---|
| `<mod>+N` | New pane (folder picker). Add `Shift` to reuse the focused pane's folder |
| `<mod>+W` | Close pane (confirms while an agent is running) |
| `<mod>+R` | Restart the shell in the focused pane |
| `<mod>+←↑↓→` | Move the focused pane. Add `Shift` to move focus instead |
| `<mod>+1…9` | Focus pane n on the current page |
| `<mod>+[` / `<mod>+]` | Previous / next page (`PageUp` / `PageDown` also work) |
| `<mod>+Tab` | Switch between Terminals and Notes (`<mod>+T` / `<mod>+M` also work) |
| `<mod>+,` | Settings |
| `F11` | Toggle fullscreen |

Holding the modifier for a moment shows the same list as a popover.

## Agent detection

A pane is marked as running an agent when a process below its shell matches one
of the configured name patterns (Settings → Agent name patterns), matched
against the full command line so Claude Code's `node.exe` is recognised. When
that process goes away the pane gets a green border and a `finished` marker,
cleared as soon as you look at the pane. Shell integration (`OSC 133`) and the
terminal bell are used as secondary signals; duplicates within five seconds are
ignored.

To get the bell signal from Claude Code in addition to process detection:

```
claude config set --global preferredNotifChannel terminal_bell
```

## Notes

Plain `.md` files under a folder you choose (default
`%USERPROFILE%\Documents\TerminalGrid\Notes`). The editor autosaves 600 ms after
the last keystroke and on blur; writes are atomic and guarded by the file's
modification time, so an edit made outside the app raises a reload/keep prompt
instead of being overwritten. Deleting moves to the Recycle Bin.

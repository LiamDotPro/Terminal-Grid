# Terminal Grid

Desktop terminal grid built on Tauri 2 (Rust) with a Notes tab for markdown.

- Design doc: `docs/technical-design.md`
- IPC contract shared by both sides: `src/ipc/types.ts`
- Shell integration script bundled with the app: `src-tauri/resources/shell-integration.ps1`

## Install (Windows)

Download the latest installer from the
[Releases page](https://github.com/LiamDotPro/Terminal-Grid/releases):

- `Terminal Grid_<version>_x64-setup.exe` installs per user with no admin prompt
  (recommended).
- `Terminal Grid_<version>_x64_en-US.msi` is the MSI for scripted or per machine
  installs.

Both bootstrap the WebView2 runtime if it is missing. Windows 10 1809 or later
is required for ConPTY.

## Build prerequisites (Windows)

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
app's own chrome, and it is the drag region. `F11` toggles fullscreen. While
fullscreen the maximize button is replaced by a highlighted "Full screen" pill
that exits it; a normal window has a thin outline and resizes from its edges.

## Build installer

```
npm run tauri build
```

Output lands in `src-tauri/target/release/bundle/nsis/` (setup.exe) and
`src-tauri/target/release/bundle/msi/`.

## Release

Bump the version in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`, commit, then tag and push:

```
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` runs the tests, builds both installers and
attaches them to a draft GitHub Release named after the tag. Publish the draft
from the Releases page once the notes look right.

Microsoft Store submission (MSIX via `scripts/pack-msix.ps1`) and the Mac App
Store assessment are in `docs/store-publishing.md`.

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
| `<mod>+N` | New pane (folder picker), placed after the focused pane. Add `Shift` to reuse the focused pane's folder |
| `<mod>+L` | Cycle pane stacking: grid, side by side, stacked |
| `<mod>+W` | Close pane (confirms while an agent is running) |
| `<mod>+R` | Restart the shell in the focused pane |
| `<mod>+←↑↓→` | Move the focused pane. Add `Shift` to move focus instead |
| `Alt+←↑↓→` | Focus the neighbouring pane in that direction |
| `<mod>+1…9` | Focus pane n on the current page |
| `<mod>+[` / `<mod>+]` | Previous / next page (`PageUp` / `PageDown` also work) |
| `<mod>+Tab` | Switch between Terminals and Notes (`<mod>+T` / `<mod>+M` also work) |
| `<mod>+B` / `<mod>+P` | Notes: hide or show the notes list / the preview |
| `<mod>+,` | Settings |
| `F11` | Toggle fullscreen |

Holding the modifier for a moment shows the same list as a popover.

## Stacking and opening panes from a pane

The three-way switch in the top bar (or `<mod>+L`) chooses how the panes on a
page stack: **grid** (both directions, the responsive 1 to 3x3 table),
**side by side** (one row, horizontal) or **stacked** (one column, vertical).
The choice is remembered in the session. In the single-direction modes the
arrow hotkeys only move along that direction.

Every pane header has a `+` button. Clicking it opens a menu to start a new
pane in the same folder or pick another one; `Shift`+click goes straight to
the folder picker. Either way the new pane lands directly after the pane it
was opened from, not at the end of the last page.

## Clipboard

The terminals use the system shortcuts: `Ctrl+V` or `Shift+Insert` pastes,
`Ctrl+C` copies while text is selected (and interrupts otherwise, as usual),
and `Ctrl+Insert` copies. Shells that enable bracketed paste get the text
wrapped accordingly.

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

## Current task

While an agent runs, the pane header shows a `task` button. It opens a card at
the top right of the terminal with the task the agent last reported, and how
long ago it did. The dot on the button lights up once a task has come in.

Every shell starts with `TERMINAL_GRID_TASK_FILE` pointing at a file for that
pane. Anything written there shows up in the card within a second, and emptying
the file clears it:

```
echo "Adding retries to the upload client" > "$TERMINAL_GRID_TASK_FILE"
```

Agents don't know about this on their own. You can tell them in two ways:

- **Ask agent** in the card types a one line request into the pane, so the
  agent writes its task now.
- **Copy instructions** copies a short section for `CLAUDE.md` or `AGENTS.md`,
  so the agent keeps the file up to date without being asked.

## Notes

Plain `.md` files under a folder you choose (default
`%USERPROFILE%\Documents\TerminalGrid\Notes`). The editor autosaves 600 ms after
the last keystroke and on blur; writes are atomic and guarded by the file's
modification time, so an edit made outside the app raises a reload/keep prompt
instead of being overwritten. Deleting moves to the Recycle Bin.

The notes list on the left and the preview on the right each fold away with
the chevron in their header; the editor in the middle always stays and takes
the freed width. A folded panel becomes a slim rail at its edge; click the rail
(or use `<mod>+B` / `<mod>+P`) to bring it back. Both choices are remembered
in the session.

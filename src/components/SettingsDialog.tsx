import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Config, HotkeyModifier, ThemePreference } from "../ipc/types";
import { cx } from "../lib/cx";
import { useAppActions, useAppState } from "../state/AppProvider";

const SHELLS = [
  { value: "", label: "Auto (pwsh, then Windows PowerShell)" },
  { value: "pwsh.exe", label: "pwsh.exe" },
  { value: "powershell.exe", label: "powershell.exe" },
  { value: "cmd.exe", label: "cmd.exe" },
];

const FONTS = ["JetBrains Mono", "Cascadia Mono", "Consolas", "Fira Code", "Menlo"];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "black", label: "Black" },
];

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;

type Draft = Pick<
  Config,
  | "shell"
  | "agentPatterns"
  | "hotkeyModifier"
  | "fontFamily"
  | "fontSize"
  | "notesRoot"
  | "theme"
  | "compactLayout"
>;

/**
 * Settings sheet from screen 1f. Edits a draft and only commits through
 * `config_set` on Save, so Cancel really is a cancel.
 */
export function SettingsDialog() {
  const state = useAppState();
  const actions = useAppActions();
  const [draft, setDraft] = useState<Draft>(() => toDraft(state.config, state.notes.root));
  // What the folder field started as. The configured path and the service's
  // canonical one differ in form on Windows (C:/x against \\?\C:\x), so
  // comparing with state.notes.root "changed" the folder on every save and
  // closed the open note.
  const [initialNotesRoot] = useState(draft.notesRoot);
  const [pattern, setPattern] = useState("");
  const sheet = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        actions.setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [actions]);

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("select, input, button")?.focus();
  }, []);

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const commitPattern = () => {
    const value = pattern.trim();
    if (!value || draft.agentPatterns.includes(value)) {
      setPattern("");
      return;
    }
    patch("agentPatterns", [...draft.agentPatterns, value]);
    setPattern("");
  };

  const onPatternKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitPattern();
    } else if (event.key === "Backspace" && pattern === "" && draft.agentPatterns.length > 0) {
      patch("agentPatterns", draft.agentPatterns.slice(0, -1));
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = pattern.trim();
    const agentPatterns =
      trimmed && !draft.agentPatterns.includes(trimmed)
        ? [...draft.agentPatterns, trimmed]
        : draft.agentPatterns;
    await actions.saveConfig({ ...draft, agentPatterns });
    // The notes root is also a service level setting: switching it creates the
    // folder if needed and reloads the tree.
    if (draft.notesRoot && draft.notesRoot !== initialNotesRoot) {
      await actions.setNotesRoot(draft.notesRoot);
    }
    actions.setSettingsOpen(false);
  };

  return (
    <div className="scrim" onMouseDown={() => actions.setSettingsOpen(false)}>
      <form
        className="sheet"
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="sheet__head">
          <h2 className="sheet__title">Settings</h2>
          <button
            type="button"
            className="sheet__close"
            aria-label="Close settings"
            onClick={() => actions.setSettingsOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="sheet__body">
          <div className="row">
            <label className="row__label" htmlFor="settings-shell">
              Shell
            </label>
            <div className="field">
              <select
                id="settings-shell"
                value={draft.shell ?? ""}
                onChange={(event) => patch("shell", event.target.value || null)}
              >
                {SHELLS.map((shell) => (
                  <option key={shell.value} value={shell.value}>
                    {shell.label}
                  </option>
                ))}
              </select>
              <span className="field__chevron" aria-hidden="true">
                ▾
              </span>
            </div>
          </div>

          <div className="row row--top">
            <div className="row__label">
              Agent name patterns
              <div className="row__hint">Process names that mark a pane as an agent</div>
            </div>
            <div className="tokens">
              {draft.agentPatterns.map((value) => (
                <span className="token" key={value}>
                  {value}
                  <button
                    type="button"
                    className="token__remove"
                    aria-label={`Remove ${value}`}
                    onClick={() =>
                      patch(
                        "agentPatterns",
                        draft.agentPatterns.filter((item) => item !== value),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="tokens__input"
                value={pattern}
                placeholder="add pattern…"
                aria-label="Add an agent name pattern"
                onChange={(event) => setPattern(event.target.value)}
                onKeyDown={onPatternKeyDown}
                onBlur={commitPattern}
              />
            </div>
          </div>

          <div className="row">
            <div className="row__label" id="settings-modifier">
              Hotkey modifier
            </div>
            <div className="segmented" role="radiogroup" aria-labelledby="settings-modifier">
              {(["ctrl+alt", "ctrl+shift"] as HotkeyModifier[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={draft.hotkeyModifier === value}
                  className={cx(
                    "segmented__item",
                    draft.hotkeyModifier === value && "segmented__item--active",
                  )}
                  onClick={() => patch("hotkeyModifier", value)}
                >
                  {value === "ctrl+alt" ? "Ctrl+Alt" : "Ctrl+Shift"}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="row__label" id="settings-theme">
              Theme
              <div className="row__hint">System follows your OS; Black is total darkness</div>
            </div>
            <div className="segmented" role="radiogroup" aria-labelledby="settings-theme">
              {THEMES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={draft.theme === value}
                  className={cx("segmented__item", draft.theme === value && "segmented__item--active")}
                  onClick={() => patch("theme", value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <div className="row__label" id="settings-compact">
              Compact layout
              <div className="row__hint">Square panes, no borders, minimal gaps</div>
            </div>
            <div className="segmented" role="radiogroup" aria-labelledby="settings-compact">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={draft.compactLayout === value}
                  className={cx(
                    "segmented__item",
                    draft.compactLayout === value && "segmented__item--active",
                  )}
                  onClick={() => patch("compactLayout", value)}
                >
                  {value ? "On" : "Off"}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label className="row__label" htmlFor="settings-font">
              Font
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 84px", gap: 8 }}>
              <div className="field">
                <select
                  id="settings-font"
                  value={draft.fontFamily ?? FONTS[0]}
                  onChange={(event) => patch("fontFamily", event.target.value)}
                >
                  {FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
                <span className="field__chevron" aria-hidden="true">
                  ▾
                </span>
              </div>
              <div className="field stepper">
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  aria-label="Font size"
                  value={draft.fontSize}
                  onChange={(event) =>
                    patch("fontSize", clampFontSize(Number(event.target.value) || draft.fontSize))
                  }
                />
                <span className="stepper__arrows">
                  <button
                    type="button"
                    aria-label="Increase font size"
                    onClick={() => patch("fontSize", clampFontSize(draft.fontSize + 1))}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Decrease font size"
                    onClick={() => patch("fontSize", clampFontSize(draft.fontSize - 1))}
                  >
                    ▼
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="row__label">Notes folder</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <div className="field">
                <span className="ellipsis" title={draft.notesRoot ?? ""}>
                  {draft.notesRoot ?? "Not set"}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => {
                  void actions.chooseNotesRoot().then((root) => {
                    if (root) patch("notesRoot", root);
                  });
                }}
              >
                Browse…
              </button>
            </div>
          </div>
        </div>

        <div className="sheet__foot">
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => actions.setSettingsOpen(false)}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function toDraft(config: Config, notesRoot: string | null): Draft {
  return {
    shell: config.shell,
    agentPatterns: config.agentPatterns,
    hotkeyModifier: config.hotkeyModifier,
    fontFamily: config.fontFamily ?? FONTS[0],
    fontSize: config.fontSize,
    notesRoot: config.notesRoot ?? notesRoot,
    theme: config.theme,
    compactLayout: config.compactLayout,
  };
}

function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

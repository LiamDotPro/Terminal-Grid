//! Config and session persistence. See docs/technical-design.md section 9.
//!
//! Two JSON files in the app config dir. Reads are tolerant: a missing or
//! corrupt file falls back to the defaults rather than failing to start.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::error::{AppError, Result};

const CONFIG_FILE: &str = "config.json";
const SESSION_FILE: &str = "session.json";

/// Fields missing from an older file take their defaults, so adding a setting
/// never resets the ones a user already has.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub version: u32,
    pub shell: Option<String>,
    pub shell_args: Vec<String>,
    pub notes_root: Option<PathBuf>,
    pub agent_patterns: Vec<String>,
    pub idle_timeout_ms: u64,
    pub hotkey_modifier: String,
    pub font_family: Option<String>,
    pub font_size: u32,
    pub scrollback: u32,
    pub restore_session_on_launch: bool,
    /// "system", "light", "dark" or "black".
    pub theme: String,
    /// Square, borderless panes with minimal gaps.
    pub compact_layout: bool,
}

const THEMES: [&str; 4] = ["system", "light", "dark", "black"];

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            shell: None,
            shell_args: Vec::new(),
            notes_root: None,
            agent_patterns: ["claude", "codex", "gemini", "aider", "gpt", "copilot"]
                .iter()
                .map(|s| (*s).to_string())
                .collect(),
            idle_timeout_ms: 4000,
            hotkey_modifier: "ctrl+alt".to_string(),
            font_family: None,
            font_size: 14,
            scrollback: 10_000,
            restore_session_on_launch: true,
            theme: "system".to_string(),
            compact_layout: false,
        }
    }
}

/// Every field optional so the frontend can send a partial update.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPatch {
    pub shell: Option<Option<String>>,
    pub shell_args: Option<Vec<String>>,
    pub notes_root: Option<Option<PathBuf>>,
    pub agent_patterns: Option<Vec<String>>,
    pub idle_timeout_ms: Option<u64>,
    pub hotkey_modifier: Option<String>,
    pub font_family: Option<Option<String>>,
    pub font_size: Option<u32>,
    pub scrollback: Option<u32>,
    pub restore_session_on_launch: Option<bool>,
    pub theme: Option<String>,
    pub compact_layout: Option<bool>,
}

impl Config {
    fn apply(&mut self, patch: ConfigPatch) {
        if let Some(value) = patch.shell {
            self.shell = value.filter(|s| !s.trim().is_empty());
        }
        if let Some(value) = patch.shell_args {
            self.shell_args = value;
        }
        if let Some(value) = patch.notes_root {
            self.notes_root = value;
        }
        if let Some(value) = patch.agent_patterns {
            self.agent_patterns = value
                .into_iter()
                .map(|p| p.trim().to_lowercase())
                .filter(|p| !p.is_empty())
                .collect();
        }
        if let Some(value) = patch.idle_timeout_ms {
            self.idle_timeout_ms = value.clamp(500, 120_000);
        }
        if let Some(value) = patch.hotkey_modifier {
            if value == "ctrl+alt" || value == "ctrl+shift" {
                self.hotkey_modifier = value;
            }
        }
        if let Some(value) = patch.font_family {
            self.font_family = value.filter(|s| !s.trim().is_empty());
        }
        if let Some(value) = patch.font_size {
            self.font_size = value.clamp(8, 32);
        }
        if let Some(value) = patch.scrollback {
            self.scrollback = value.clamp(100, 200_000);
        }
        if let Some(value) = patch.restore_session_on_launch {
            self.restore_session_on_launch = value;
        }
        if let Some(value) = patch.theme {
            if THEMES.contains(&value.as_str()) {
                self.theme = value;
            }
        }
        if let Some(value) = patch.compact_layout {
            self.compact_layout = value;
        }
    }
}

/// Opaque to the core: the frontend owns the shape, we only round-trip it.
pub type Session = serde_json::Value;

pub struct StateService {
    dir: PathBuf,
    config: Arc<RwLock<Config>>,
}

impl StateService {
    pub fn new(dir: PathBuf) -> Self {
        let config = load_json(&dir.join(CONFIG_FILE)).unwrap_or_default();
        Self {
            dir,
            config: Arc::new(RwLock::new(config)),
        }
    }

    pub fn config(&self) -> Config {
        self.config.read().expect("config lock").clone()
    }

    pub fn set_config(&self, patch: ConfigPatch) -> Result<Config> {
        let updated = {
            let mut guard = self.config.write().expect("config lock");
            guard.apply(patch);
            guard.clone()
        };
        write_json(&self.dir.join(CONFIG_FILE), &updated)?;
        Ok(updated)
    }

    /// Used when a command changes a setting outside of `config_set`.
    pub fn update_config(&self, mutate: impl FnOnce(&mut Config)) -> Result<Config> {
        let updated = {
            let mut guard = self.config.write().expect("config lock");
            mutate(&mut guard);
            guard.clone()
        };
        write_json(&self.dir.join(CONFIG_FILE), &updated)?;
        Ok(updated)
    }

    pub fn session(&self) -> Option<Session> {
        load_json(&self.dir.join(SESSION_FILE))
    }

    pub fn set_session(&self, session: &Session) -> Result<()> {
        write_json(&self.dir.join(SESSION_FILE), session)
    }
}

fn load_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    // A file edited by hand on Windows often arrives with a UTF-8 BOM, which
    // serde_json refuses; the settings should still load.
    let raw = raw.trim_start_matches('\u{feff}');
    match serde_json::from_str(raw) {
        Ok(value) => Some(value),
        Err(error) => {
            // A hand-edited or truncated file must not stop the app from starting.
            eprintln!("terminal-grid: ignoring {}: {error}", path.display());
            None
        }
    }
}

/// Written through a temp file so a crash mid-write cannot truncate the real one.
fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(value)
        .map_err(|e| AppError::Io { message: e.to_string() })?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, json)?;
    fs::rename(&temp, path)?;
    Ok(())
}

/// `%APPDATA%\com.liamread.terminalgrid` on Windows.
pub fn config_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Io { message: e.to_string() })?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

// Commands ----------------------------------------------------------------

#[tauri::command]
pub fn config_get(state: State<'_, crate::AppState>) -> Config {
    state.state.config()
}

#[tauri::command]
pub fn config_set(
    state: State<'_, crate::AppState>,
    patch: ConfigPatch,
) -> Result<Config> {
    let notes_root = patch.notes_root.clone().flatten();
    let config = state.state.set_config(patch)?;
    if let Some(root) = notes_root {
        // Keep the notes service in step with the setting it was saved from.
        state.notes.set_root(root)?;
    }
    Ok(config)
}

#[tauri::command]
pub fn session_get(state: State<'_, crate::AppState>) -> Option<Session> {
    state.state.session()
}

#[tauri::command]
pub fn session_set(state: State<'_, crate::AppState>, session: Session) -> Result<()> {
    state.state.set_session(&session)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_only_touches_the_fields_it_carries() {
        let mut config = Config::default();
        config.apply(ConfigPatch {
            font_size: Some(18),
            ..Default::default()
        });
        assert_eq!(config.font_size, 18);
        assert_eq!(config.scrollback, 10_000);
        assert!(config.restore_session_on_launch);
    }

    #[test]
    fn patch_clamps_and_normalises() {
        let mut config = Config::default();
        config.apply(ConfigPatch {
            font_size: Some(400),
            idle_timeout_ms: Some(1),
            hotkey_modifier: Some("meta+q".to_string()),
            agent_patterns: Some(vec!["  Claude  ".into(), "".into()]),
            shell: Some(Some("   ".into())),
            ..Default::default()
        });
        assert_eq!(config.font_size, 32);
        assert_eq!(config.idle_timeout_ms, 500);
        assert_eq!(config.hotkey_modifier, "ctrl+alt");
        assert_eq!(config.agent_patterns, vec!["claude".to_string()]);
        assert_eq!(config.shell, None);
    }

    #[test]
    fn appearance_patch_accepts_known_themes_only() {
        let mut config = Config::default();
        assert_eq!(config.theme, "system");
        config.apply(ConfigPatch {
            theme: Some("black".into()),
            compact_layout: Some(true),
            ..Default::default()
        });
        assert_eq!(config.theme, "black");
        assert!(config.compact_layout);
        config.apply(ConfigPatch {
            theme: Some("sepia".into()),
            ..Default::default()
        });
        assert_eq!(config.theme, "black");
    }

    #[test]
    fn a_config_written_before_new_settings_keeps_its_values() {
        let config: Config =
            serde_json::from_str(r#"{"version":1,"fontSize":18,"hotkeyModifier":"ctrl+shift"}"#)
                .expect("older config parses");
        assert_eq!(config.font_size, 18);
        assert_eq!(config.hotkey_modifier, "ctrl+shift");
        assert_eq!(config.theme, "system");
        assert!(!config.compact_layout);
    }

    #[test]
    fn a_file_with_a_utf8_bom_still_loads() {
        let dir = std::env::temp_dir().join(format!("terminal-grid-bom-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join(CONFIG_FILE);
        fs::write(&path, "﻿{\"version\":1,\"fontSize\":21}").expect("write");

        let loaded: Option<serde_json::Value> = load_json(&path);
        assert_eq!(loaded.and_then(|v| v["fontSize"].as_u64()), Some(21));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn explicit_null_clears_an_optional_field() {
        let mut config = Config {
            font_family: Some("Consolas".into()),
            ..Config::default()
        };
        config.apply(ConfigPatch {
            font_family: Some(None),
            ..Default::default()
        });
        assert_eq!(config.font_family, None);
    }
}

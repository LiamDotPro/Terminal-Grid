//! Agent CLIs found on PATH, so a pane header only offers launchers for the
//! agents the user actually has installed.

use std::ffi::OsStr;
use std::path::PathBuf;

use crate::error::Result;

/// Launch commands, in the order the buttons appear.
const KNOWN: &[&str] = &["claude", "codex", "gemini", "copilot", "aider"];

/// The entries of `names` with an executable in one of `dirs`. `exts` are the
/// suffixes to try (PATHEXT on Windows, just "" elsewhere).
pub fn find<'a>(names: &[&'a str], dirs: &[PathBuf], exts: &[String]) -> Vec<&'a str> {
    names
        .iter()
        .copied()
        .filter(|name| {
            dirs.iter().any(|dir| {
                exts.iter()
                    .any(|ext| dir.join(format!("{name}{ext}")).is_file())
            })
        })
        .collect()
}

fn path_exts() -> Vec<String> {
    if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
            .split(';')
            .filter(|ext| !ext.is_empty())
            .map(str::to_ascii_lowercase)
            .collect()
    } else {
        vec![String::new()]
    }
}

pub fn installed() -> Vec<String> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let dirs: Vec<PathBuf> = std::env::split_paths(OsStr::new(&path)).collect();
    find(KNOWN, &dirs, &path_exts())
        .into_iter()
        .map(str::to_string)
        .collect()
}

#[tauri::command]
pub async fn installed_agents() -> Result<Vec<String>> {
    crate::blocking(installed).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn only_agents_with_an_executable_on_path_are_found() {
        let dir = std::env::temp_dir().join(format!("tg-agents-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("temp dir");
        fs::write(dir.join("claude.cmd"), "").expect("write");
        fs::create_dir_all(dir.join("codex.cmd")).expect("a folder is not a command");

        let exts = vec![".exe".to_string(), ".cmd".to_string()];
        let found = find(&["claude", "codex", "gemini"], &[dir.clone()], &exts);
        assert_eq!(found, vec!["claude"]);

        let _ = fs::remove_dir_all(&dir);
    }
}

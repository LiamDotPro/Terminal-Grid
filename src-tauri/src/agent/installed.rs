//! Agent CLIs found on PATH, so a pane header only offers launchers for the
//! agents the user actually has installed.

use std::ffi::OsStr;
use std::path::PathBuf;
#[cfg(not(windows))]
use std::time::Duration;

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

/// The `PATH` value in `env` output, ignoring anything else the shell's
/// startup files printed. The last match wins, since that is env's own.
pub fn path_from_env_output(output: &str) -> Option<&str> {
    output
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix("PATH="))
}

/// The PATH the user's login shell builds. An app opened from Finder or the
/// Dock only inherits launchd's /usr/bin:/bin:/usr/sbin:/sbin, so agents
/// installed into ~/.local/bin, Homebrew and the like are missing from our own
/// PATH even though they run fine in a pane. Asks `$SHELL -ilc env` (parsing
/// env's output works for zsh, bash and fish alike) and gives up after a few
/// seconds in case a startup file waits on input.
#[cfg(not(windows))]
fn login_shell_path() -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut child = Command::new(shell)
        .args(["-ilc", "/usr/bin/env"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    // Read on another thread so a startup file that hangs, or leaves a
    // background process holding stdout open, can't hold us past the timeout.
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut output = String::new();
        let _ = stdout.read_to_string(&mut output);
        let _ = tx.send(output);
    });
    let output = rx.recv_timeout(Duration::from_secs(5)).ok();
    let _ = child.kill();
    let _ = child.wait();

    path_from_env_output(&output?).map(str::to_string)
}

/// Where the agent installers put their commands, for when the login shell
/// can't be asked.
#[cfg(not(windows))]
fn usual_dirs() -> Vec<PathBuf> {
    let mut found = vec![PathBuf::from("/opt/homebrew/bin"), PathBuf::from("/usr/local/bin")];
    if let Some(home) = dirs::home_dir() {
        for sub in [".local/bin", ".claude/local", ".npm-global/bin", ".bun/bin", ".cargo/bin"] {
            found.push(home.join(sub));
        }
    }
    found
}

fn search_dirs() -> Vec<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    #[allow(unused_mut)]
    let mut dirs: Vec<PathBuf> = std::env::split_paths(OsStr::new(&path)).collect();
    #[cfg(not(windows))]
    {
        if let Some(login) = login_shell_path() {
            dirs.extend(std::env::split_paths(OsStr::new(&login)));
        }
        dirs.extend(usual_dirs());
        let mut seen = std::collections::HashSet::new();
        dirs.retain(|dir| seen.insert(dir.clone()));
    }
    dirs
}

pub fn installed() -> Vec<String> {
    find(KNOWN, &search_dirs(), &path_exts())
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

    #[test]
    fn the_path_is_read_from_env_output_past_startup_noise() {
        let output = "Welcome back!\nPATH=not this one\nHOME=/Users/me\nPATH=/Users/me/.local/bin:/usr/bin\nSHELL=/bin/zsh\n";
        assert_eq!(path_from_env_output(output), Some("/Users/me/.local/bin:/usr/bin"));
        assert_eq!(path_from_env_output("no path here"), None);
    }
}

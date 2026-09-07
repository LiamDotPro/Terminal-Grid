//! Shell discovery and the launch arguments that pull in the integration
//! script. See docs/technical-design.md sections 4.2 and 4.5.

use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ShellKind {
    Pwsh,
    WindowsPowerShell,
    Cmd,
    Bash,
    Zsh,
    Other,
}

impl ShellKind {
    /// Classifies a shell by its executable name, ignoring path and extension.
    pub fn from_program(program: &str) -> Self {
        let stem = Path::new(program)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(program)
            .to_ascii_lowercase();
        match stem.as_str() {
            "pwsh" | "pwsh-preview" => ShellKind::Pwsh,
            "powershell" => ShellKind::WindowsPowerShell,
            "cmd" => ShellKind::Cmd,
            "bash" | "sh" => ShellKind::Bash,
            "zsh" => ShellKind::Zsh,
            _ => ShellKind::Other,
        }
    }

    fn is_powershell(self) -> bool {
        matches!(self, ShellKind::Pwsh | ShellKind::WindowsPowerShell)
    }

    fn is_posix(self) -> bool {
        matches!(self, ShellKind::Bash | ShellKind::Zsh)
    }
}

pub struct Shell {
    pub program: String,
    pub kind: ShellKind,
    pub args: Vec<String>,
}

/// Resolves the shell to launch: the configured one, else the best available.
///
/// Windows order is pwsh, then Windows PowerShell, then `%COMSPEC%`; elsewhere
/// `$SHELL`, then `/bin/bash`.
pub fn resolve(configured: Option<&str>, extra_args: &[String], script_dir: &Path) -> Shell {
    let program = configured
        .map(str::to_string)
        .filter(|p| !p.trim().is_empty())
        .unwrap_or_else(default_program);
    let kind = ShellKind::from_program(&program);

    let mut args = integration_args(kind, script_dir);
    args.extend(extra_args.iter().cloned());

    Shell {
        program,
        kind,
        args,
    }
}

#[cfg(windows)]
fn default_program() -> String {
    if which("pwsh.exe") {
        return "pwsh.exe".to_string();
    }
    if which("powershell.exe") {
        return "powershell.exe".to_string();
    }
    std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
}

#[cfg(not(windows))]
fn default_program() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

fn integration_args(kind: ShellKind, script_dir: &Path) -> Vec<String> {
    if kind.is_powershell() {
        let script = script_dir.join("shell-integration.ps1");
        return vec![
            "-NoLogo".to_string(),
            "-NoExit".to_string(),
            "-Command".to_string(),
            format!(". '{}'", script.display().to_string().replace('\'', "''")),
        ];
    }
    if kind.is_posix() {
        let script = script_dir.join("shell-integration.sh");
        // --rcfile would skip the user's own rc, so source ours afterwards instead.
        return vec![
            "-c".to_string(),
            format!(
                ". \"{}\"; exec \"$0\" -i",
                script.display().to_string().replace('"', "\\\"")
            ),
        ];
    }
    // cmd.exe and anything unrecognised run bare; the process watcher still works.
    Vec::new()
}

/// Copies the bundled integration scripts into the app data dir on first run.
/// They are re-copied on every launch so an app update refreshes them.
pub fn install_scripts(resource_dir: &Path, target_dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(target_dir)?;
    for name in ["shell-integration.ps1", "shell-integration.sh"] {
        let source = resource_dir.join("resources").join(name);
        let source = if source.exists() {
            source
        } else {
            resource_dir.join(name)
        };
        if source.exists() {
            fs::copy(&source, target_dir.join(name))?;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn which(program: &str) -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    static CACHE: OnceLock<std::sync::Mutex<std::collections::HashMap<String, bool>>> =
        OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some(found) = cache.lock().expect("which cache").get(program) {
        return *found;
    }

    let found = Command::new("where.exe")
        .arg(program)
        .creation_flags(crate::git::cli::CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);

    cache
        .lock()
        .expect("which cache")
        .insert(program.to_string(), found);
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_shells_by_executable_name() {
        assert_eq!(ShellKind::from_program("pwsh.exe"), ShellKind::Pwsh);
        assert_eq!(
            ShellKind::from_program(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.EXE"),
            ShellKind::WindowsPowerShell
        );
        assert_eq!(ShellKind::from_program("/bin/zsh"), ShellKind::Zsh);
        assert_eq!(ShellKind::from_program("nu"), ShellKind::Other);
    }

    #[test]
    fn powershell_gets_the_dot_sourced_script() {
        let args = integration_args(ShellKind::Pwsh, Path::new("C:/data"));
        assert_eq!(args[0], "-NoLogo");
        assert!(args.last().unwrap().contains("shell-integration.ps1"));
    }

    #[test]
    fn cmd_launches_bare() {
        assert!(integration_args(ShellKind::Cmd, Path::new("C:/data")).is_empty());
    }

    #[test]
    fn configured_shell_wins_and_extra_args_follow() {
        let shell = resolve(
            Some("cmd.exe"),
            &["/K".to_string(), "echo hi".to_string()],
            Path::new("C:/data"),
        );
        assert_eq!(shell.program, "cmd.exe");
        assert_eq!(shell.kind, ShellKind::Cmd);
        assert_eq!(shell.args, vec!["/K".to_string(), "echo hi".to_string()]);
    }
}

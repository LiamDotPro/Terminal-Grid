//! Parser for `git worktree list --porcelain`.
//! See docs/technical-design.md section 7.3.

use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedWorktree {
    pub path: PathBuf,
    pub head: Option<String>,
    /// `refs/heads/x` reduced to `x`.
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
    pub prunable: bool,
}

/// Blocks are separated by blank lines and always start with `worktree <path>`.
/// The first block is the main worktree. Unknown attribute lines are ignored so
/// a newer git can add fields without breaking this.
pub fn parse(porcelain: &str) -> Vec<ParsedWorktree> {
    let mut worktrees = Vec::new();
    let mut current: Option<ParsedWorktree> = None;

    for line in porcelain.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            worktrees.extend(current.take());
            continue;
        }

        let (key, rest) = match line.split_once(' ') {
            Some((key, rest)) => (key, rest),
            None => (line, ""),
        };

        match key {
            "worktree" => {
                worktrees.extend(current.take());
                current = Some(ParsedWorktree {
                    path: PathBuf::from(normalise(rest)),
                    head: None,
                    branch: None,
                    bare: false,
                    detached: false,
                    locked: false,
                    prunable: false,
                });
            }
            "HEAD" => {
                if let Some(worktree) = current.as_mut() {
                    worktree.head = Some(rest.to_string());
                }
            }
            "branch" => {
                if let Some(worktree) = current.as_mut() {
                    worktree.branch = Some(rest.trim_start_matches("refs/heads/").to_string());
                }
            }
            "bare" => {
                if let Some(worktree) = current.as_mut() {
                    worktree.bare = true;
                }
            }
            "detached" => {
                if let Some(worktree) = current.as_mut() {
                    worktree.detached = true;
                }
            }
            "locked" => {
                if let Some(worktree) = current.as_mut() {
                    worktree.locked = true;
                }
            }
            "prunable" => {
                if let Some(worktree) = current.as_mut() {
                    worktree.prunable = true;
                }
            }
            _ => {}
        }
    }

    worktrees.extend(current);
    worktrees
}

/// Git prints forward slashes even on Windows; normalise anything else we meet
/// so path comparisons elsewhere have one shape to deal with.
pub fn normalise(path: &str) -> String {
    path.trim().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "worktree C:/dev/app\n\
                          HEAD 3f2a91c0000000000000000000000000000000aa\n\
                          branch refs/heads/main\n\
                          \n\
                          worktree C:/dev/app-feature\n\
                          HEAD 91bc000000000000000000000000000000000bb\n\
                          branch refs/heads/feature/x\n\
                          locked\n\
                          \n\
                          worktree C:/dev/app-old\n\
                          HEAD 77ab000000000000000000000000000000000cc\n\
                          detached\n\
                          prunable gitdir file points to non-existent location\n";

    #[test]
    fn reads_every_block() {
        let worktrees = parse(SAMPLE);
        assert_eq!(worktrees.len(), 3);
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert_eq!(worktrees[1].branch.as_deref(), Some("feature/x"));
        assert!(worktrees[1].locked);
        assert!(worktrees[2].detached);
        assert!(worktrees[2].prunable);
        assert_eq!(worktrees[2].branch, None);
    }

    #[test]
    fn the_first_block_is_the_main_worktree() {
        assert_eq!(parse(SAMPLE)[0].path, PathBuf::from("C:/dev/app"));
    }

    #[test]
    fn handles_paths_with_spaces() {
        let worktrees = parse("worktree C:/dev/my app\nHEAD abc\nbranch refs/heads/main\n");
        assert_eq!(worktrees[0].path, PathBuf::from("C:/dev/my app"));
    }

    #[test]
    fn handles_a_bare_repository() {
        let worktrees = parse("worktree C:/dev/bare.git\nbare\n");
        assert_eq!(worktrees.len(), 1);
        assert!(worktrees[0].bare);
        assert_eq!(worktrees[0].head, None);
    }

    #[test]
    fn tolerates_missing_trailing_newline_and_crlf() {
        let worktrees = parse("worktree C:/a\r\nHEAD abc\r\nbranch refs/heads/main");
        assert_eq!(worktrees.len(), 1);
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert_eq!(worktrees[0].head.as_deref(), Some("abc"));
    }

    #[test]
    fn ignores_unknown_attributes() {
        let worktrees = parse("worktree C:/a\nHEAD abc\nsomething-new value\n");
        assert_eq!(worktrees.len(), 1);
        assert_eq!(worktrees[0].head.as_deref(), Some("abc"));
    }

    #[test]
    fn empty_input_yields_nothing() {
        assert!(parse("").is_empty());
        assert!(parse("\n\n").is_empty());
    }

    #[test]
    fn normalises_backslashes() {
        assert_eq!(normalise(r"C:\dev\app"), "C:/dev/app");
    }
}

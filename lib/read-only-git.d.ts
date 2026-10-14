/**
 * Read-only git command fast-path.
 *
 * One deterministic question: is this shell command text a SINGLE git
 * invocation whose subcommand cannot write to disk, execute another program,
 * or reach the network? A hit lets the gate skip approval in the modes that
 * otherwise always prompt for the shell family (`request` / `auto-edit`), and
 * lets the smart-mode evaluator skip its LLM call.
 *
 * Why a strict parse and not a regex (contrast `smart-danger-patterns.ts`):
 * the danger list is a BLOCKLIST — a pattern written too loosely only costs
 * an extra prompt, so prose-shaped regexes are the right tool there. An
 * allowlist has the opposite failure polarity: a match that is too loose is
 * a silent privilege escalation. So the two mechanisms are deliberately
 * asymmetric. Every rule below is "when in doubt, do not match" — the caller
 * treats `undefined` as "keep asking".
 *
 * Rules, in order. Any failure returns undefined:
 *
 *   1. Non-empty string, and free of shell syntax (`;` `&` `|` `<` `>` `$`
 *      backtick `(` `)` `{` `}` `"` `'` `\` CR LF NUL). That is what keeps
 *      `git status && rm -rf /`, `git status > f`, `git status $(x)` and
 *      `FOO=1 git status` out, and it also keeps `sudo` / `env` / `sh -c`
 *      prefixes out (the first token is no longer `git`).
 *   2. First token is exactly `git`.
 *   3. Only these pre-subcommand global options are accepted: `-C <path>`
 *      (repeatable), `--no-pager`, `-P`. Any other leading `-x` aborts —
 *      which is what rejects `-c`, `--config-env`, `--exec-path`,
 *      `--git-dir`, `--work-tree` and friends in one place.
 *   4. The subcommand is in the table below.
 *   5. No argument is `--ext-diff`, `--textconv`, or `--output*` (external
 *      diff driver execution / writing a file).
 *   6. The subcommand's own rule holds — several git subcommands are
 *      read-only in their bare or listing form and write the moment a
 *      positional argument appears (`git branch foo`, `git tag v1`,
 *      `git stash`, `git remote add …`).
 *
 * Deliberately NOT covered:
 *   - `config` (`--get` reads, a bare assignment writes — too easy to get
 *     wrong), `symbolic-ref` (`--short` reads, an argument writes),
 *     `grep` (`-O` / `--open-files-in-pager` executes a command; use the
 *     `grep` tool), `cat-file` (`--batch` reads stdin).
 *   - `remote show` and every network command (`fetch`, `pull`, `clone`,
 *     `ls-remote`): read-only on disk, but they leave the machine, so they
 *     keep asking.
 *   - Quoted arguments (`git -C "a b" status`, `git log --format='%h %s'`):
 *     quotes are rejected to keep tokenization trivially trustworthy.
 *
 * ponytail: two accepted ceilings, both documented in
 * `docs/adr/0003-read-only-command-fast-path.md`.
 *   - `diff` / `log` / `show` / `blame` still execute the repository's
 *     textconv filter or external diff driver when the repo's
 *     `.gitattributes` + git config configure one. That is git's own
 *     behaviour and is not decidable from the command text; we only reject
 *     the explicit `--ext-diff` / `--textconv` opt-ins.
 *   - The subcommand set is code, not configuration. Add `config` /
 *     `symbolic-ref` / `grep` here only with a per-subcommand argument rule
 *     (never as a loose regex), and keep the deployer kill switch as the
 *     only knob (`readOnlyGitCommands`).
 *
 * Dependency-free on purpose (mirrors `sandbox-escalation.ts`): pure text in,
 * label or undefined out, so the rules are unit-testable without a host.
 */
/**
 * Match a shell command against the read-only git fast-path.
 *
 * @param command - The raw `bash` / `pwsh` command text (may be undefined
 *   when the tool arguments carry no `command` string).
 * @returns A short label for the matched read-only invocation
 *   (`'status'`, `'log'`, `'stash list'`, …) for the decision log, or
 *   undefined when the command must keep asking for approval.
 */
export declare function matchReadOnlyGitCommand(command: string | undefined): string | undefined;
//# sourceMappingURL=read-only-git.d.ts.map
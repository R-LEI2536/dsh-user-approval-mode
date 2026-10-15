/**
 * Read-only command fast-path.
 *
 * One deterministic question: is this shell command text a CHAIN of git
 * invocations (plus harmless `echo` lines), where every link is a
 * strictly-parsed invocation that cannot write to disk, execute another
 * program, or reach the network? A hit lets the gate skip approval in the
 * modes that otherwise always prompt for the shell family (`request` /
 * `auto-edit`), and lets the smart-mode evaluator skip its LLM call.
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
 *   1. Non-empty string, and free of the shell syntax we refuse to re-parse:
 *      redirection `>` `<`, substitution `$` backtick, subshells and blocks
 *      `(` `)` `{` `}`, line continuation `\`, CR, NUL. Redirection is what
 *      keeps `echo x > f` (and `git status 2>&1`) out; the first-token rules
 *      below are what keep `FOO=1 git status` and `sudo` / `env` / `sh -c`
 *      prefixes out.
 *   2. The text is split on the command separators `;` `&` `|` and newline
 *      (which covers `&&`, `||`, `|&`). EVERY segment must pass rules 3–6:
 *      a chain is allowed only because each of its links is safe, never
 *      because the first one is. An empty segment (a leading or trailing
 *      separator, as in `git status &&`) aborts. Splitting is deliberately
 *      not quote-aware: we split MORE than the shell does, so a separator
 *      hidden inside quotes costs a false rejection, never a silent grant.
 *   3. `echo` is the single stdout-only command in the table: a segment
 *      whose first token is exactly `echo` matches whatever its arguments
 *      are, because redirection (rule 1) is its only way to write anything.
 *   4. Every other segment starts with the token `git`, and only the
 *      pre-subcommand globals `-C <path>` (repeatable), `--no-pager` and
 *      `-P` are accepted — any other leading `-x` aborts, which is what
 *      rejects `-c`, `--config-env`, `--exec-path`, `--git-dir`,
 *      `--work-tree` and friends in one place.
 *   5. A non-echo segment may not contain a quote. A quoted git argument
 *      hides its own name from every check below: `git diff "--output=/x"`
 *      writes a file under git's own quote handling while comparing unequal
 *      here. (Quotes inside an ECHO argument are fine — that is what lets
 *      the agent write `echo "=== status ==="`.)
 *   6. The subcommand is in the table below, no argument is `--ext-diff`,
 *      `--textconv` or `--output*`, and the subcommand's own rule holds —
 *      several git subcommands are read-only in their bare or listing form
 *      and write the moment a positional argument appears (`git branch foo`,
 *      `git tag v1`, `git stash`, `git remote add …`).
 *
 * Deliberately NOT covered:
 *   - `config` (`--get` reads, a bare assignment writes — too easy to get
 *     wrong), `symbolic-ref` (`--short` reads, an argument writes),
 *     `grep` (`-O` / `--open-files-in-pager` executes a command; use the
 *     `grep` tool), `cat-file` (`--batch` reads stdin).
 *   - `remote show` and every network command (`fetch`, `pull`, `clone`,
 *     `ls-remote`): read-only on disk, but they leave the machine, so they
 *     keep asking.
 *   - Quoted GIT arguments (`git -C "a b" status`, `git log --format='%h %s'`):
 *     rejected, because a quoted flag name slips past the flag checks below
 *     (`git diff "--output=x"` writes a file). Echo arguments may be quoted.
 *   - Any redirection (`git status 2>&1`, `git log > f`) and any non-git
 *     consumer in a pipe (`git log | head`): the read side must never turn
 *     into a writer, so both keep asking.
 *   - `cd` (`cd repo && git status`), `sudo` / `env` / `sh -c` prefixes, and
 *     `printf` / `true` / `:` / `pwd`. `printf` writes only to stdout like
 *     `echo` and would be safe to add; the agent does not use it. `cd` changes
 *     what the following links read, so it stays out until something needs it.
 *     Add a name to `STDOUT_COMMANDS` (or its own rule) only with the same
 *     "no write, no exec, no network" argument.
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
 * Match a shell command against the read-only command fast-path.
 *
 * @param command - The raw `bash` / `pwsh` command text (may be undefined
 *   when the tool arguments carry no `command` string).
 * @returns A short label for the matched command — `'status'`, `'stash list'`,
 *   or the links of a chain joined with `' + '` (`'status + echo + diff'`) —
 *   for the decision log, or undefined when the command must keep asking for
 *   approval.
 */
export declare function matchReadOnlyGitCommand(command: string | undefined): string | undefined;
//# sourceMappingURL=read-only-git.d.ts.map
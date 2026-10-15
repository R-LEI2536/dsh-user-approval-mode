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
/** Shell syntax we refuse to re-parse, tested against the WHOLE command text
 *  before it is split: redirection, substitution, subshells and blocks, line
 *  continuation, CR, NUL. Quotes are NOT here (rule 5 judges them per
 *  segment) and neither are the command separators below. Inside a character
 *  class `$`, `(`, `)`, `{`, `}` are literal; `\x5c` is a single backslash. */
const SHELL_SYNTAX = /[<>$`(){}\x5c\r\u0000]/;
/** Command separators, collapsed: `;`, `&`, `|` (which covers `&&`, `||`,
 *  `|&`) and newline. A collapsed run only means an empty command in the
 *  shell — bash rejects that outright (`git status &&& git log`) and nothing
 *  runs — so there is nothing there for us to vet. */
const COMMAND_SEPARATOR = /[;&|\n]+/;
/** The one stdout-only command we accept anywhere in a chain. Its arguments
 *  are inert text: redirection is already rejected by `SHELL_SYNTAX`, so it
 *  cannot write a file, and it cannot start a process of its own. Anything
 *  with a write or exec flag (`tee`, `sort -o`, `sed -i`) must never be
 *  added here. */
const STDOUT_COMMANDS = new Set(['echo']);
/** Quotes are rejected in every non-echo segment (rule 5). */
const QUOTES = /['"]/;
/** Global options we pass through before the subcommand. `-C` takes a path,
 *  the other two are boolean. */
const GLOBAL_PATH_OPTIONS = new Set(['-C']);
const GLOBAL_BOOLEAN_OPTIONS = new Set(['--no-pager', '-P']);
/** Subcommands that are read-only whatever their arguments are. */
const ALWAYS_READ_ONLY = new Set([
    'status',
    'log',
    'diff',
    'show',
    'rev-parse',
    'rev-list',
    'describe',
    'shortlog',
    'show-ref',
    'for-each-ref',
    'ls-files',
    'ls-tree',
    'blame',
    'name-rev',
    'merge-base',
    'count-objects',
]);
/** `git branch` flags that mutate refs (the listing flags are not here). */
const BRANCH_WRITE_FLAGS = new Set([
    '-d', '-D', '-m', '-M', '-c', '-C', '-u', '-f',
    '--delete', '--move', '--copy', '--set-upstream-to', '--unset-upstream',
    '--edit-description', '--track',
]);
/** `git tag` flags that create, move, or delete a tag. */
const TAG_WRITE_FLAGS = new Set([
    '-a', '-s', '-d', '-D', '-f', '-m', '-F', '-u', '-e',
    '--annotate', '--sign', '--delete', '--force', '--file', '--edit', '--create-reflog',
]);
/** `git tag` flags that keep a positional argument in listing/verify form.
 *  Only value-less flags may appear here. `--contains` / `--merged` /
 *  `--points-at` take an OPTIONAL value, so they cannot count as listing
 *  evidence: `git tag --points-at HEAD v1` still creates tag `v1`, and a
 *  parser that reads `--points-at` as "listing" would wave it through. */
const TAG_LISTING_FLAGS = new Set(['-l', '--list', '-v', '--verify']);
/** The flag's own name, so `--delete=foo` is judged like `--delete`. */
function flagName(token) {
    const equals = token.indexOf('=');
    return equals === -1 ? token : token.slice(0, equals);
}
/** Arguments rejected for every subcommand: write a file, or run an
 *  external diff helper. `--no-ext-diff` is the safe direction, so the
 *  `--ext-diff` test is exact rather than a prefix test. */
function isDangerousArgument(argument) {
    return argument === '--ext-diff'
        || argument === '--textconv'
        || argument.startsWith('--output');
}
function isFlag(token) {
    return token.startsWith('-');
}
function positionals(args) {
    return args.filter((argument) => !isFlag(argument));
}
/** Index of the subcommand token, or undefined when the tokens after `git`
 *  are not a recognised global-option prefix followed by a subcommand. */
function subcommandIndex(tokens) {
    let index = 1;
    while (index < tokens.length) {
        const token = tokens[index];
        if (token === undefined || !isFlag(token))
            return index;
        if (GLOBAL_BOOLEAN_OPTIONS.has(token)) {
            index += 1;
            continue;
        }
        if (GLOBAL_PATH_OPTIONS.has(token)) {
            if (index + 1 >= tokens.length)
                return undefined; // `git -C` with no path
            index += 2;
            continue;
        }
        return undefined; // -c / --git-dir / --exec-path / anything else
    }
    return undefined; // global options only, no subcommand
}
/** `git branch`: listing only. A positional argument creates or deletes a
 *  ref (`git branch --list <pattern>` therefore asks too — the strict form is
 *  intentional), and every ref-mutating flag is rejected outright. */
function matchBranch(args) {
    if (positionals(args).length > 0)
        return undefined;
    if (args.some((argument) => BRANCH_WRITE_FLAGS.has(flagName(argument))))
        return undefined;
    return 'branch';
}
/** `git tag`: bare (list) or listing/verify flags may carry a pattern;
 *  anything that can create a tag is rejected. */
function matchTag(args) {
    if (args.some((argument) => TAG_WRITE_FLAGS.has(flagName(argument))))
        return undefined;
    if (positionals(args).length === 0)
        return 'tag';
    return args.some((argument) => TAG_LISTING_FLAGS.has(flagName(argument))) ? 'tag' : undefined;
}
/** `git remote`: local listing and URL read only. `show` is excluded — it
 *  may contact the remote, like the network commands we do not allow. */
function matchRemote(args) {
    const first = args[0];
    if (first === undefined || first === '-v' || first === '--verbose')
        return 'remote';
    if (first === 'get-url')
        return 'remote get-url';
    return undefined;
}
/** `git stash`: bare `git stash` pushes a new stash, so only the read
 *  sub-forms are matched. */
function matchStash(args) {
    const first = args[0];
    if (first === 'list' || first === 'show')
        return `stash ${first}`;
    return undefined;
}
function matchWorktree(args) {
    return args[0] === 'list' ? 'worktree list' : undefined;
}
function matchSubmodule(args) {
    const first = args[0];
    if (first === 'status' || first === 'summary')
        return `submodule ${first}`;
    return undefined;
}
function matchSubcommand(subcommand, args) {
    if (ALWAYS_READ_ONLY.has(subcommand))
        return subcommand;
    switch (subcommand) {
        case 'branch': return matchBranch(args);
        case 'tag': return matchTag(args);
        case 'remote': return matchRemote(args);
        case 'stash': return matchStash(args);
        case 'worktree': return matchWorktree(args);
        case 'submodule': return matchSubmodule(args);
        default: return undefined;
    }
}
/** One segment: rule 3 (`echo`) or rules 4–6 (a single `git` invocation).
 *  The caller guarantees the whole text is free of `SHELL_SYNTAX`. */
function matchSingleInvocation(segment) {
    const trimmed = segment.trim();
    if (trimmed.length === 0)
        return undefined;
    // Whitespace splitting is exact for the command word: a quoted or otherwise
    // mangled command word (`"echo" x`, `ec"ho" x`) is in neither table, and
    // rule 5 rejects the rest.
    const tokens = trimmed.split(/\s+/);
    const command = tokens[0];
    if (command !== undefined && STDOUT_COMMANDS.has(command))
        return command;
    if (QUOTES.test(trimmed))
        return undefined;
    if (command !== 'git')
        return undefined;
    const index = subcommandIndex(tokens);
    if (index === undefined)
        return undefined;
    const subcommand = tokens[index];
    if (subcommand === undefined)
        return undefined;
    const args = tokens.slice(index + 1);
    if (args.some(isDangerousArgument))
        return undefined;
    return matchSubcommand(subcommand, args);
}
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
export function matchReadOnlyGitCommand(command) {
    if (typeof command !== 'string')
        return undefined;
    const trimmed = command.trim();
    if (trimmed.length === 0)
        return undefined;
    if (SHELL_SYNTAX.test(trimmed))
        return undefined;
    // Every segment must match: a chain is allowed because each of its links is
    // safe, never because the first one is.
    const labels = [];
    for (const segment of trimmed.split(COMMAND_SEPARATOR)) {
        const label = matchSingleInvocation(segment);
        if (label === undefined)
            return undefined;
        labels.push(label);
    }
    return labels.join(' + ');
}
//# sourceMappingURL=read-only-git.js.map
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

/** Shell syntax we refuse to reason about. Inside a character class `$`,
 *  `(`, `)`, `{`, `}`, `"`, `'` are literal; `\\` is a single backslash. */
const SHELL_SYNTAX = /[;&|<>$`(){}"'\\\r\n\u0000]/

/** Global options we pass through before the subcommand. `-C` takes a path,
 *  the other two are boolean. */
const GLOBAL_PATH_OPTIONS = new Set(['-C'])
const GLOBAL_BOOLEAN_OPTIONS = new Set(['--no-pager', '-P'])

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
])

/** `git branch` flags that mutate refs (the listing flags are not here). */
const BRANCH_WRITE_FLAGS = new Set([
  '-d', '-D', '-m', '-M', '-c', '-C', '-u', '-f',
  '--delete', '--move', '--copy', '--set-upstream-to', '--unset-upstream',
  '--edit-description', '--track',
])

/** `git tag` flags that create, move, or delete a tag. */
const TAG_WRITE_FLAGS = new Set([
  '-a', '-s', '-d', '-D', '-f', '-m', '-F', '-u', '-e',
  '--annotate', '--sign', '--delete', '--force', '--file', '--edit', '--create-reflog',
])

/** `git tag` flags that keep a positional argument in listing/verify form.
 *  Only value-less flags may appear here. `--contains` / `--merged` /
 *  `--points-at` take an OPTIONAL value, so they cannot count as listing
 *  evidence: `git tag --points-at HEAD v1` still creates tag `v1`, and a
 *  parser that reads `--points-at` as "listing" would wave it through. */
const TAG_LISTING_FLAGS = new Set(['-l', '--list', '-v', '--verify'])

/** The flag's own name, so `--delete=foo` is judged like `--delete`. */
function flagName(token: string): string {
  const equals = token.indexOf('=')
  return equals === -1 ? token : token.slice(0, equals)
}

/** Arguments rejected for every subcommand: write a file, or run an
 *  external diff helper. `--no-ext-diff` is the safe direction, so the
 *  `--ext-diff` test is exact rather than a prefix test. */
function isDangerousArgument(argument: string): boolean {
  return argument === '--ext-diff'
    || argument === '--textconv'
    || argument.startsWith('--output')
}

function isFlag(token: string): boolean {
  return token.startsWith('-')
}

function positionals(args: readonly string[]): readonly string[] {
  return args.filter((argument) => !isFlag(argument))
}

/** Index of the subcommand token, or undefined when the tokens after `git`
 *  are not a recognised global-option prefix followed by a subcommand. */
function subcommandIndex(tokens: readonly string[]): number | undefined {
  let index = 1
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === undefined || !isFlag(token)) return index
    if (GLOBAL_BOOLEAN_OPTIONS.has(token)) {
      index += 1
      continue
    }
    if (GLOBAL_PATH_OPTIONS.has(token)) {
      if (index + 1 >= tokens.length) return undefined // `git -C` with no path
      index += 2
      continue
    }
    return undefined // -c / --git-dir / --exec-path / anything else
  }
  return undefined // global options only, no subcommand
}

/** `git branch`: listing only. A positional argument creates or deletes a
 *  ref (`git branch --list <pattern>` therefore asks too — the strict form is
 *  intentional), and every ref-mutating flag is rejected outright. */
function matchBranch(args: readonly string[]): string | undefined {
  if (positionals(args).length > 0) return undefined
  if (args.some((argument) => BRANCH_WRITE_FLAGS.has(flagName(argument)))) return undefined
  return 'branch'
}

/** `git tag`: bare (list) or listing/verify flags may carry a pattern;
 *  anything that can create a tag is rejected. */
function matchTag(args: readonly string[]): string | undefined {
  if (args.some((argument) => TAG_WRITE_FLAGS.has(flagName(argument)))) return undefined
  if (positionals(args).length === 0) return 'tag'
  return args.some((argument) => TAG_LISTING_FLAGS.has(flagName(argument))) ? 'tag' : undefined
}

/** `git remote`: local listing and URL read only. `show` is excluded — it
 *  may contact the remote, like the network commands we do not allow. */
function matchRemote(args: readonly string[]): string | undefined {
  const first = args[0]
  if (first === undefined || first === '-v' || first === '--verbose') return 'remote'
  if (first === 'get-url') return 'remote get-url'
  return undefined
}

/** `git stash`: bare `git stash` pushes a new stash, so only the read
 *  sub-forms are matched. */
function matchStash(args: readonly string[]): string | undefined {
  const first = args[0]
  if (first === 'list' || first === 'show') return `stash ${first}`
  return undefined
}

function matchWorktree(args: readonly string[]): string | undefined {
  return args[0] === 'list' ? 'worktree list' : undefined
}

function matchSubmodule(args: readonly string[]): string | undefined {
  const first = args[0]
  if (first === 'status' || first === 'summary') return `submodule ${first}`
  return undefined
}

function matchSubcommand(subcommand: string, args: readonly string[]): string | undefined {
  if (ALWAYS_READ_ONLY.has(subcommand)) return subcommand
  switch (subcommand) {
    case 'branch': return matchBranch(args)
    case 'tag': return matchTag(args)
    case 'remote': return matchRemote(args)
    case 'stash': return matchStash(args)
    case 'worktree': return matchWorktree(args)
    case 'submodule': return matchSubmodule(args)
    default: return undefined
  }
}

/**
 * Match a shell command against the read-only git fast-path.
 *
 * @param command - The raw `bash` / `pwsh` command text (may be undefined
 *   when the tool arguments carry no `command` string).
 * @returns A short label for the matched read-only invocation
 *   (`'status'`, `'log'`, `'stash list'`, …) for the decision log, or
 *   undefined when the command must keep asking for approval.
 */
export function matchReadOnlyGitCommand(command: string | undefined): string | undefined {
  if (typeof command !== 'string') return undefined
  const trimmed = command.trim()
  if (trimmed.length === 0) return undefined
  if (SHELL_SYNTAX.test(trimmed)) return undefined

  // Quotes are already rejected above, so whitespace splitting is exact.
  const tokens = trimmed.split(/\s+/)
  if (tokens[0] !== 'git') return undefined

  const index = subcommandIndex(tokens)
  if (index === undefined) return undefined
  const subcommand = tokens[index]
  if (subcommand === undefined) return undefined

  const args = tokens.slice(index + 1)
  if (args.some(isDangerousArgument)) return undefined
  return matchSubcommand(subcommand, args)
}

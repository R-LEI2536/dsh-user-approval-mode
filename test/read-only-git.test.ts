/**
 * Unit tests for the read-only git fast-path parser.
 *
 * `matchReadOnlyGitCommand` is the whole safety story of the fast-path: it
 * decides which shell commands stop prompting under request / auto-edit and
 * which ones skip the smart-mode LLM call. So the negative table matters more
 * than the positive one — every entry there is a command that must keep
 * asking, and the parser is deliberately biased towards `undefined`.
 *
 * The last test pins the schema default of the deployer kill switch, which is
 * what an unconfigured deployment (and every existing `cordis.patch.yml` that
 * does not mention the field) will run with.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { matchReadOnlyGitCommand } from '../src/read-only-git.ts'
import { Config } from '../src/index.ts'

/** Commands that must match, with the label the decision log will carry. */
const ALLOWED: ReadonlyArray<readonly [string, string]> = [
  ['git status', 'status'],
  ['  git status  ', 'status'],
  ['git status --short', 'status'],
  ['git status -sb', 'status'],
  ['git status -- src/', 'status'],
  ['git\tstatus', 'status'],
  ['git  status', 'status'],
  ['git log --oneline -5', 'log'],
  ['git log -n 5 --stat', 'log'],
  ['git log --format=%h', 'log'],
  ['git diff', 'diff'],
  ['git diff HEAD~1 --stat', 'diff'],
  ['git diff --no-index a b', 'diff'],
  ['git show HEAD:src/index.ts', 'show'],
  ['git rev-parse HEAD', 'rev-parse'],
  ['git rev-list --count HEAD', 'rev-list'],
  ['git describe --tags --always', 'describe'],
  ['git shortlog -sn', 'shortlog'],
  ['git show-ref --heads', 'show-ref'],
  ['git for-each-ref refs/heads', 'for-each-ref'],
  ['git ls-files -z', 'ls-files'],
  ['git ls-tree HEAD src', 'ls-tree'],
  ['git blame src/index.ts', 'blame'],
  ['git name-rev HEAD', 'name-rev'],
  ['git merge-base HEAD~1 HEAD', 'merge-base'],
  ['git count-objects -v', 'count-objects'],
  ['git -C /repo status', 'status'],
  ['git -C /repo -C /other log -1', 'log'],
  ['git --no-pager log --oneline', 'log'],
  ['git -P diff', 'diff'],
  ['git branch', 'branch'],
  ['git branch -a', 'branch'],
  ['git branch -vv', 'branch'],
  ['git branch --show-current', 'branch'],
  ['git tag', 'tag'],
  ['git tag -l', 'tag'],
  ['git tag -l v*', 'tag'],
  ['git tag -n', 'tag'],
  ['git tag -v v1', 'tag'],
  ['git remote', 'remote'],
  ['git remote -v', 'remote'],
  ['git remote get-url origin', 'remote get-url'],
  ['git stash list', 'stash list'],
  ['git stash show', 'stash show'],
  ['git worktree list', 'worktree list'],
  ['git submodule status', 'submodule status'],
  ['git submodule summary', 'submodule summary'],
]

/** Commands that must NOT match — the parser stays out and the gate asks. */
const DENIED: readonly string[] = [
  // Not a usable command string at all.
  '', '   ',
  'git', 'git   ',
  'git --no-pager', 'git -P', 'git -C /repo', 'git -C',

  // Not a bare `git` invocation (prefixes / wrappers / env assignment).
  'sudo git status',
  'env git status',
  'sh -c "git status"',
  'GIT_PAGER=cat git status',
  'echo git status',
  'gitk status',
  '/usr/bin/git status',

  // Shell composition, redirection, substitution, control characters.
  'git status && rm -rf /',
  'git status; rm -rf /',
  'git status & rm -rf /',
  'git status | tee out',
  'git status > out',
  'git status >> out',
  'git status < in',
  'git status $(rm -rf /)',
  'git status `rm -rf /`',
  // Parentheses are rejected outright, so git's `%(atom)` format syntax asks.
  'git for-each-ref --format=%(refname) refs/heads',
  'git status \\; rm -rf /',
  'git status\nrm -rf /',
  'git status\r\nrm -rf /',
  'git status\u0000',

  // Quoted arguments (kept out so tokenization stays trivially trustworthy).
  'git -C "/a b" status',
  'git status "short"',
  "git status 'short'",
  "git log --pretty=format:'%h %s'",
  "git tag -l 'v*'",

  // Global options that can change config / paths / execution.
  'git -c core.pager=cat status',
  'git --config-env=FOO=BAR status',
  'git --exec-path status',
  'git --git-dir=/repo status',
  'git --work-tree=/repo status',
  'git --bare status',
  'git --namespace=ns status',

  // Arguments that write a file or execute an external diff helper.
  'git diff --output=x',
  'git diff --output x',
  'git log --ext-diff',
  'git show --textconv',

  // Read-only only in the bare/listing form; these variants write.
  'git branch foo',
  'git branch -d foo',
  'git branch -m old new',
  'git branch -M old new',
  'git branch --delete foo',
  'git branch --delete',
  'git branch --set-upstream-to=origin/main',
  'git branch --list feat/*',
  'git tag v1',
  'git tag -a v1 -m x',
  'git tag -d v1',
  'git tag --delete v1',
  'git tag --delete=v1',
  'git tag --contains HEAD',
  'git tag --points-at HEAD v1',
  'git remote add origin url',
  'git remote set-url origin url',
  'git remote remove origin',
  'git remote rename a b',
  'git remote show origin',
  'git stash',
  'git stash push -m x',
  'git stash pop',
  'git stash drop',
  'git worktree add /tmp/x',
  'git worktree remove /tmp/x',
  'git submodule update --init',
  'git submodule add url path',

  // Excluded subcommands (v1 ceiling), including the one that runs a pager.
  'git config --get user.name',
  'git config user.name x',
  'git symbolic-ref HEAD',
  'git grep -Ocat foo',
  'git grep --open-files-in-pager=cat foo',
  'git grep foo',
  'git cat-file -p HEAD',

  // Network and every other writing subcommand.
  'git fetch',
  'git pull',
  'git clone repo',
  'git ls-remote origin',
  'git push',
  'git push origin main',
  'git commit -m x',
  'git checkout main',
  'git switch main',
  'git restore src/index.ts',
  'git reset --hard',
  'git clean -fdx',
  'git apply patch.diff',
  'git gc',
  'git fsck',
  'git update-ref HEAD HEAD~1',
  'git reflog expire --all',
]

test('matchReadOnlyGitCommand: matches the read-only forms with a log label', () => {
  for (const [command, label] of ALLOWED) {
    assert.equal(matchReadOnlyGitCommand(command), label, `expected a match: ${JSON.stringify(command)}`)
  }
})

test('matchReadOnlyGitCommand: refuses everything else', () => {
  for (const command of DENIED) {
    assert.equal(matchReadOnlyGitCommand(command), undefined, `expected no match: ${JSON.stringify(command)}`)
  }
})

test('matchReadOnlyGitCommand: returns undefined for a missing command', () => {
  assert.equal(matchReadOnlyGitCommand(undefined), undefined)
})

test('readOnlyGitCommands: the schema default is true (fast-path on)', () => {
  // The field is `.volatile()` (a user-editable settings switch), so the
  // resolved value comes through `.get()`. This also pins that volatility:
  // a plain field has no `.get()`, and this test fails.
  const resolved = Config({}) as unknown as { readOnlyGitCommands: { get(): boolean } }
  assert.equal(resolved.readOnlyGitCommands.get(), true)
})

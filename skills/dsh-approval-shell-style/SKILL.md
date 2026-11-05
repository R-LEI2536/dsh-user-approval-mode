---
name: dsh-approval-shell-style
description: Load before writing git inspection or commit-review commands in a session with dsh-user-approval, and whenever an approval prompt blocks shell work or a command was rejected. It gives the command shapes the read-only git fast path accepts (git and echo segments only, no quotes, redirects, non-git pipes, or cd) and the inspection that always-allowed read-only tools cover instead. Not for changing the plugin's code.
whenToUse: Before writing git status/log/diff/show or review commands under dsh-user-approval, after an approval prompt or a rejected command, or when another skill needs an approval-friendly command style.
---

# Approval-friendly shell style

This skill ships with the `dsh-user-approval` plugin. When the plugin is mounted, every tool call is classified by tool family: read-only tools are allowed in every mode; the shell family asks for approval in `request` and `auto-edit`; and a strict read-only git fast path (`readOnlyGitCommands`, on by default) skips that prompt.

## 1. Prefer the always-allowed tools

Use `read`, `glob`, `grep`, `list_directory`, `read_image`, and `todo_write` for inspection: they never prompt. `cat`, `ls`, `head`, and `tail` are shell-family commands and do prompt.

## 2. The read-only git fast path

A command skips approval only when every condition holds:

1. The text is a chain of segments joined by `&&`, `;`, `|`, or newlines, and every segment qualifies on its own — one bad link sends the whole chain back to approval.
2. Each segment is either `echo <any text>` or `git <read-only invocation>`.
3. The whole text contains none of: `<` `>` (redirection), `$`, a backtick, `(`, `)`, `{`, `}`, a backslash line continuation, CR, or NUL.
4. A git segment contains no quotes (`'` or `"`). An echo segment may quote its text.
5. Only the global options `-C <path>`, `--no-pager`, and `-P` may precede the subcommand; any other global option (`-c`, `--git-dir`, `--exec-path`, `--work-tree`, …) disqualifies the segment.
6. The subcommand and its arguments match the table below, and no argument is `--ext-diff`, `--textconv`, or `--output*`.

| Kind | Subcommands | Constraint |
|---|---|---|
| Always read-only | `status` `log` `diff` `show` `rev-parse` `rev-list` `describe` `shortlog` `show-ref` `for-each-ref` `ls-files` `ls-tree` `blame` `name-rev` `merge-base` `count-objects` | Any arguments, subject to rules 3–6 |
| Listing only | `branch` | No positional argument (`git branch dev` creates a branch); `-a`, `-v`, `--show-current` are fine |
| Listing / verify | `tag` | No positional argument, or `-l` / `--list` / `-v` / `--verify` (`git tag -l v1*` works); `-a`, `-s`, `-d`, `-m` disqualify |
| Local read | `remote -v` / `remote get-url`, `stash list` / `stash show`, `worktree list`, `submodule status` / `submodule summary` | Only those sub-forms; bare `git stash` writes |

**Common forms that drop back to approval:** `git log --format='%h %s'` (quotes), `git status 2>&1` (redirection), `git log | head` (non-git consumer), `cd repo && git status` (`cd`), `git -C "a b" status` (quoted path), `git grep` / `git check-ignore` / `git config` / `git cat-file` (not in the table), `git ls-remote` (network), and every writing subcommand.

## 3. Recipes

```bash
# Workspace overview
git status --porcelain=v1 -uall && echo ---BRANCH--- && git branch --show-current && echo ---LOG--- && git log -n 3 --oneline

# Changed and untracked files
git diff --stat HEAD && echo ---UNTRACKED--- && git ls-files --others --exclude-standard

# Commit message style (sha + body, no quotes)
git log -n 4 --format=%h%n%B

# Per-commit review
git show --stat --oneline <sha1> <sha2>

# Another working tree (-C instead of cd)
git -C /path/to/repo status --short
```

- Prefer quote-free output options: `--oneline`, `--format=%h%n%B`, `--name-only`, `--stat`. Formats with spaces (`%h %s`) need quotes and therefore prompt.
- Put several read-only commands on separate lines instead of one long `&&` chain; both are free, and the newlines are easier to read.
- `git branch --list <pattern>` has a positional argument and prompts; list all branches and filter with the grep tool instead.

## 4. Prompts that are expected

`git add`, `git commit` (including heredocs), `git switch` / `checkout`, `git merge` / `rebase` / `reset`, `git push` / `fetch` / `pull` / `ls-remote`, `git apply`, `git check-ignore`, `git diff > file`, `node` / `pnpm` / `npm` / `python` scripts, and `cat` / `ls` / `head` all prompt. This is the gate working as designed: do not decompose a write into odd forms, pipe around it, or reach for `sandbox_permissions` just to avoid a prompt.

## 5. After a rejection

- Do not retry the same command, and do not rerun the same work under another form.
- Try a grammar fix first: drop quotes, pipes, redirection, or `cd`, and switch to quote-free flags. A read-only git chain that now parses goes back through the fast path.
- When the call really needs to write, reach the network, or escalate, say so and let the user decide.
- `sandbox_permissions` is only valid together with `justification`; omit both when approvals are disabled.
- If a command did not run, report that it was not verified — never invent its output.

## 6. PTC preset sessions

In a session on the `ptc` agent preset the model can call only `run_code`; the other tools are reachable only as `tools.*` bindings inside the program. The gate still applies, one level down:

- `run_code` itself is the transport and does not prompt. Do not read that as licence for what the program does.
- Every `tools.write` / `tools.bash` / `tools.read` sub-call passes exactly the gate described above, under its real tool name. So the same rules apply: prefer `tools.read` / `tools.glob` / `tools.grep` over `tools.bash`, and keep `tools.bash` command text inside the read-only git grammar.
- A PTC sub-call's approval prompt adds a `[args: …]` summary (the command or path, one line, up to 200 characters) because the host dialog cannot render a nested call's arguments. Read it before approving.
- A rejected sub-call raises `ToolCallError` for that binding only. Catch it, do not retry the same call in another shape, and report what was not verified.
- Approval prompts wait inside the `run_code` run budget (default 120 s, capped at 600 s). Batch a program's gated calls instead of queueing many prompts, or the run can end while it waits.
- A direct `import('node:fs')` / `node:child_process` inside the program bypasses this gate entirely and is bounded only by the sandbox. Do not use it to route around a prompt.

## 7. Self-check

- Is every segment a read-only `git` subcommand or an `echo`?
- Any quotes inside a git segment? Any redirection, `$`, backtick, or parentheses anywhere?
- Any non-git pipe consumer (`head`, `cat`, `grep`)?
- Any `cd`, `sudo`, `env`, `sh -c`, `-c`, or `--git-dir` in the command?
- Are writes and network calls expected to prompt, rather than something to work around?

## Maintenance

The behaviour source is this plugin's `src/read-only-git.ts`; its rationale and accepted boundaries are in `docs/adr/0003-read-only-command-fast-path.md`. PTC-preset behaviour and its limits are in `docs/adr/0004-run-code-is-a-transport.md`. Keep this skill in sync when the parser changes. An approved chain is logged as `[dsh-user-approval[read-only-git]] decision=allow detail=<label>`.

`description` is the only trigger surface. The session catalog renders `- \`name\`: description` and nothing else: whitespace is collapsed, and the text is truncated with `...` past `catalogDescriptionMaxLength` (500 characters by default in `tool-skill`). `whenToUse` is stored and shown in the UI, but it never reaches the model's decision, so a cue that lives only there is a cue that never fires. Keep the situation that should make an agent load this skill in the first clause of `description`, and keep the whole line under 500 characters.

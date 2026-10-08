# Read-only git commands are auto-allowed by a strict parser, not by a configurable list

Status: accepted (revised — see "Revision history").

The agent spends a large share of its shell calls on `git status`, `git log`,
`git diff` and friends, which are read-only but still landed in the shell
family — so `request` and `auto-edit` prompted on every one of them, and
`smart` paid an LLM round-trip for them. We added a **read-only command
fast-path**: when the command text is a single strictly-parsed read-only git
invocation, the gate allows it without prompting (request / auto-edit / smart)
and the smart-mode evaluator skips session memory and the classifier. The
rules are code (`src/read-only-git.ts`), not configuration; the only knob is
the `readOnlyGitCommands` switch (default on).

## Considered options

1. **Do nothing.** `read/glob/grep` already cover file browsing and the
   `askReason` copy tells the model to prefer them. Rejected: git state is not
   file browsing — there is no dedicated tool for "what changed on this
   branch" — so the prompts are pure friction, and the friction is exactly
   where the agent's loop is hottest.
2. **A regex allowlist, mirroring the danger list's shape.** Rejected, and
   this is the decision worth remembering: the danger list is a *blocklist*,
   where a pattern written too loosely costs one extra prompt, so prose-shaped
   regexes are the right tool there. An allowlist has the opposite failure
   polarity — a pattern written too loosely is a silent grant — and no regex
   can express "`git tag` counts only when it carries no positional argument".
   The two mechanisms are deliberately asymmetric, so the fast-path parses.
3. **A deployer-configurable subcommand list.** Rejected: a flat list of
   names cannot carry the per-subcommand argument rules (`branch`, `tag`,
   `stash`, `remote` are read-only bare and write with a positional), and
   letting a deployer name `push` in it would convert a read-only allowlist
   into an arbitrary-command one.
4. **A settings-page field (user-editable).** Rejected: ADR 0001/0002 drew the
   line at the safety floor — the deployer owns it, the end user does not get
   to widen what runs unprompted (`smartDangerPatterns` and the classifier
   prompt are likewise deployer-only).
5. **Skip the fast-path in smart mode** (keep it request/auto-edit only).
   Rejected: the same command class is the same friction there, and paying an
   LLM call for `git status` is the worst of both worlds.

## Why

- **A strict parser is auditable in a way a regex is not.** Everything that
  composes, redirects, substitutes, quotes, prefixes a wrapper (`sudo`, `env`,
  `sh -c`), or passes a config/exec/path global option (`-c`, `--exec-path`,
  `--git-dir`, …) fails to match and keeps asking. So does every subcommand
  whose read-only form is bare-only, and `--output*` / `--ext-diff` /
  `--textconv`. The bias is deliberately one-sided: `undefined` means "ask".
- **This does not re-open ADR 0002's rejected "pure-rule auto-approve".**
  That option replaced the classifier for *all* shell commands and was
  rejected for not scaling. This is a short-circuit for the single
  highest-frequency class of read-only command; the LLM still owns the long
  tail.
- **The ordering preserves "the danger list is a hard floor".** The fast-path
  is checked after the danger list (inside the evaluator, not in the gate), so
  even a deployer-added `smartExtraDangerPatterns` entry that matches a
  `git status` wins and the call still asks. Putting it in the gate would have
  made that invariant quietly false for configured patterns.
- **The sandbox-escalation guard stays first.** In smart mode a call carrying
  `sandbox_permissions` is intercepted before the evaluator runs, so a
  read-only command cannot smuggle a widening request past the user.

## Consequences

- `readOnlyGitCommands` is one of the settings namespace's volatile fields, so
  it defaults to `true` and is exposed as a switch on the settings page
  (`Tool classification` card). Existing deployments (including
  `cordis.patch.yml` files that never mention it) get the new behaviour on
  upgrade and must turn the switch off to keep "shell always asks" in request
  and auto-edit. A deployer can still pin a `base` in `cordis.yml`; a user
  override wins over that base, and the row's Reset falls back to it.
- Request mode's documented contract narrows: "shell family requires
  approval" now has a read-only git exception. CONTEXT.md states it in the
  mode definitions rather than leaving it to the mode table.
- Decision logging gains a dedicated tag,
  `[dsh-user-approval[read-only-git]] decision=allow detail=<subcommand>`, in
  every gated mode. The existing `[dsh-user-approval[smart]]` lines are
  unchanged, so existing greps keep working.
- The client settings component needed a `FALLBACK` entry and `readValue` line
  for the new field (`Required<Config>` in `src/client/ApprovalModeSettings.tsx`)
  plus the switch row; the client bundle must be rebuilt alongside the server
  one.
- **Accepted ceiling (not closed):** `diff` / `log` / `show` / `blame` still
  execute a repository-configured textconv filter or external diff driver,
  because git does that itself and no command-text check can see it. We only
  reject the explicit `--ext-diff` / `--textconv` opt-ins. Closing it would
  need forcing `--no-textconv`/`--no-ext-diff` onto every diff-family
  invocation, which changes the output the user asked to see.
- **Accepted boundary:** quoted arguments do not match, so `git log
  --format='%h %s'`, `git -C "a b" status` and git's `%(atom)` format syntax
  (`(` is rejected) keep asking. Fail-closed beats a quote-aware tokenizer.

## Revision history

- **Revision 1** (initial): `readOnlyGitCommands` was deployer-only (considered
  option 4 above rejected the settings-page control on the ADR 0001/0002
  boundary that keeps safety-floor knobs with the deployer). Revised after the
  code shipped and was verified live: the plugin's owner asked for the switch in
  the Web UI, so the field became `.volatile()` and gained a row on the settings
  page. The trade-off is small — the switch only moves between "every shell call
  asks" and "a strictly-parsed read-only git call does not" — and a deployer can
  still pin the strict `base`.

# dsh-user-approval-mode

Approval-mode policy plugin for DeepSeek Harness. Decides, per tool call, whether the user must approve before execution. Sits at `tools/pre-execute` and returns `{ kind: 'ask' }` when the active mode and the tool's family together demand approval.

## Language

**ApprovalMode**:
The strategic stance a session runs under. Drives the gate at `tools/pre-execute`.
_Avoid_: "permission mode", "policy mode"

**Request mode**:
Strictest. Edit family, shell family, and unclassified tools all require approval; read-only family exempt, and a read-only command chain is exempt via the read-only command fast-path.

**Auto-edit mode**:
Edit family auto-approved; shell family and unclassified require approval; read-only family exempt, and a read-only command chain is exempt via the read-only command fast-path.

**Smart mode**:
The shell upgrade of auto-edit. Edit family auto-approved; read-only family exempt; `other` family follows `unclassified`. Shell family is routed through a five-step pipeline (danger list → read-only command fast-path → session memory → LLM classifier → fail-safe) — dangerous commands are forwarded to manual review; approved calls are auto-allowed and remembered for the session's TTL; timeout / protocol errors / non-approve verdicts always fall back to manual review.

**Yolo mode**:
No approvals required; every tool executes without prompt.

**Off mode**:
Plugin gate disengages entirely; DSH's default approval behavior is restored.

**ToolFamily**:
A tool's classification, combined with the active mode to decide approval. Four values: `edit`, `shell`, `readonly`, `other`.
_Avoid_: "tool group", "tool category"

**Edit family**:
Tools that modify file or goal state (`write` / `edit` / `str_replace_editor` / `update_goal` by default).

**Shell family**:
Tools that execute commands (`bash` / `pwsh` by default).

**Read-only family**:
Tools that only read state — exempt from approval in every mode (`read` / `glob` / `grep` / `read_image` / `list_directory` / `todo_write` / `reme_search` / `list_agents` / `job_list` / `get_goal` by default). `autoAllowTools` is checked before the family check, so `readOnly` is a fall-through exemption while `autoAllow` is an explicit one.

**Read-only command fast-path**:
The gate's command-level exemption: a strictly-parsed read-only command chain — one or more links joined by `;` `&` `|` or newline, where each link is a read-only git invocation (`git status`, `git log`, `git diff`, …) or an `echo "…"` decoration line — is allowed without prompting even though it belongs to the shell family. It applies under request, auto-edit, and smart. It is fail-closed — anything the parser cannot establish as non-writing, non-executing, non-network links keeps asking, and one bad link rejects the whole chain (redirection is refused for the entire text before it is split, and a quoted **git** argument is refused because a quoted flag name hides from the flag checks) — and it is the mirror image of the danger list: that one is a blocklist whose loose patterns only cost an extra prompt, this one is an allowlist where a loose match would be a silent grant, so it parses instead of pattern-matching. Under smart mode it sits after the danger list and before session memory and the classifier, so a danger-pattern hit always wins. User-editable switch (settings page), also settable as the cordis `base`: `readOnlyGitCommands` (default on).
_Avoid_: "git allowlist", "safe command list", "白名单" — the mechanism is a parser, not a set of patterns, and calling it a list invites the assumption that it can be widened by adding a name.

**Bundled approval shell style skill**:
The packaged agent skill `dsh-approval-shell-style` (`skills/dsh-approval-shell-style/SKILL.md`) that states the gate's command contract from the agent's side: always-allowed tools, the read-only git fast-path grammar, the calls that still prompt, and the post-rejection posture. `src/approval-skill.ts` registers it through the optional `skills` service (`ctx.inject(['skills'])` + `ctx.effect`) as a `bundled` provider with rank 600 whose `resourceBase` is the packaged skill directory; the body is read from the packaged file, and its frontmatter supplies the `description` the session catalog renders and the `whenToUse` the UI shows. The catalog line is `- \`name\`: description`, whitespace-collapsed and truncated with `...` past `catalogDescriptionMaxLength` (500 characters by default in `tool-skill`), so `description` is the skill's only trigger surface — a cue that lives only in `whenToUse` never reaches the model's decision. Every session in the profile sees it while the plugin is mounted, unloading or disabling the plugin unregisters it, and a project or user skill with the same name overrides it (ranks 100/200/400/500 all beat 600). A missing or malformed packaged file, or a host without a skills service, skips the contribution with a warning and never fails plugin startup. Its body also states the **PTC transport** contract: `run_code` itself does not prompt, every `tools.*` binding call passes the gate, and a rejected binding raises `ToolCallError` without a licence to route around it.
_Avoid_: "docs skill" (the agent loads it at runtime, it is not documentation), "remote doctor skill" (that bundled asset belongs to the DSH Remote plugin)

**Other (family)**:
Tools that fall in no configured family; behavior controlled by the `unclassified` strategy.

**Family list**:
One of `editTools`, `shellTools`, `readOnlyTools`. The three lists are mutually exclusive — a tool name belongs to at most one of them. UI shows a soft warning text reminding the user not to overlap; runtime fallback priority when overlap exists is `edit > shell > readonly > other`.
_Avoid_: "classification set", "category list"

**autoAllowTools**:
Tool names that bypass approval regardless of family classification (`ask_user_question` / `exit_plan_mode` plus the control-and-orchestration tools `job_output` / `skill` / `subagent` / `present` / `wait_agent` / `send_message` / `team_task_update` / `team_task_list` / `run_code` by default). Checked BEFORE family lookup, so overlap with any family list is harmless (redundant, not conflicting). These four lists are the plugin's schema defaults (`src/index.ts`), pinned by `test/tool-family-defaults.test.ts`. `run_code` is listed here as the PTC transport, not as an orchestration tool — see **PTC transport**.

**PTC transport** (`run_code`):
The one tool a `ptc` agent-preset session exposes to the model. The plugin treats it as a transport, not an action: it ships in `autoAllowTools`, so it never prompts in any mode and its program code is never sent to the smart classifier. The real actions are the program's **PTC sub-calls**. Removing `run_code` from the configured list (settings page or cordis base) is the escape hatch that restores one prompt per program; the host approval panel cannot show the program either way, because it renders only a top-level tool node's shell command. A model-direct call to a collapsed native tool is rejected by the host before the gate, so the plugin neither allows nor intercepts it.
_Avoid_: "run_code tool family", "program tool" — it is a transport and belongs to no family; putting it in one changes nothing because `autoAllowTools` is checked first.

**PTC sub-call**:
One `tools.*` binding dispatch inside a `run_code` program. It carries `parent`, the outer `rootCallId`, a `<runCallId>:ptc:<n>` call id, the calling agent, and its real tool name, and it re-enters the same `tools/pre-execute` waterfall — so the tool-family table applies unchanged (`write` asks under request, `bash` goes through the smart pipeline, `read` is exempt). It never carries the program-level transport identity. A denied or cancelled sub-call only raises `ToolCallError` for that binding: the program may catch it, retry, or take another route, and every retry passes the gate again. Tool-level gating cannot stop a program's direct `import('node:fs')` / `node:child_process` effects, so under PTC the sandbox mode is the only write boundary.

**PTC argument summary**:
The `[args: …]` suffix the gate appends to a PTC sub-call's ask reason. The host approval panel resolves only a top-level tool node's `command`, while a sub-call is nested under the `run_code` node, so without the suffix the user would approve an invisible command. The summary prefers `command` (shell), then `path` / `file_path` / `filePath` / `file`, else the JSON body; it is whitespace-collapsed and capped at 200 characters. Native calls never get it — their dialog already shows the arguments. It adds no exposure surface: the same arguments are already durable in the `tool/ptc-dispatch-start` session event.

**Smart classifier pipeline** (smart mode, shell family only):
The five ordered steps the smart-mode shell classifier runs on every shell call: (1) **danger list** — a deterministic regex set; any match hands off to manual review before the LLM is consulted. (2) **read-only command fast-path** — a strictly-parsed chain of read-only git invocations (plus `echo` decoration lines) auto-approves here, without consulting session memory or the LLM; it is ordered after the danger list so a configured pattern can never be bypassed by it. (3) **session memory** — a per-session `sha256(toolName + rawArguments)` map; a hit auto-approves without re-running the classifier. (4) **LLM classifier** — one-shot chat call to a configurable LLM returning `{"verdict":"approve"}` or `{"verdict":"ask"}`; only `approve` auto-allows. (5) **fail-safe fallback** — every unexpected outcome (timeout, protocol violation, missing seam, exception, non-approve verdict) routes to manual review. One additional guard sits after step 3 and before step 4: when the newest genuine user message exceeds the 2000-character budget, the gate short-circuits with `detail=latest-user-message-too-long` and skips the LLM call — session memory still wins because the guard is positioned AFTER the memory lookup, mirroring `dsh-auto-approve`.

**Danger list**:
The 13 built-in regex sources in `src/smart-danger-patterns.ts` (`rm -rf /`, `dd of=/dev/`, `mkfs`, force-push, `curl|sh`, drop database, `truncate`, `shutdown`/`reboot`/`halt`, `chmod -R 777 /`, fork bomb, `terraform`/`pulumi destroy`). Compiled case-insensitively at startup; the deployer may append `smartExtraDangerPatterns` via cordis, or replace the built-ins entirely via `smartDangerPatterns: string[] | null` (`null` keeps built-ins; non-null replaces). Both knobs are deployer-only and are not exposed in the settings page.

**Smart session memory**:
Per-session `Map<sha256(toolName + rawArguments), { source: 'classifier' | 'human'; at: number }>`. TTL defaults to 30 minutes (`smartSessionMemoryTtlMs`); each session is bounded at 200 entries FIFO. The `'classifier'` source is written when the LLM approves the call; the `'human'` source is reserved for a future `approval/decided` event subscription that the smart gate does not currently emit. Cross-session isolation is mandatory — a remember in session A is invisible to session B.

**Smart classifier prompt**:
The system prompt the LLM sees when asked to classify a shell call. Defaults to `DEFAULT_SMART_CLASSIFIER_PROMPT` (verbatim port of `dsh-auto-approve`'s `CLASSIFIER_SYSTEM_PROMPT`). Deployer-only override (`smartClassifierPrompt`); never exposed in the settings page — the safety contract lives behind the deployer's signature.

**Smart LLM seam**:
Two optional services the host may expose for the classifier: `ctx.llm` (the `LlmRuntime` stream API; cast at use site to a narrower `SmartLlmService`) and `ctx.agentDefaultModel` (`currentSelection(): { provider, model } | undefined`). When `smartProvider` / `smartModel` are non-null in the settings, they win over `agentDefaultModel.currentSelection()`. When both seams are absent, every shell call in smart mode falls back to ask (`detail: 'llm-unavailable'` or `'no-default-model'`).

**Smart lifetime signal**:
A plugin-owned `AbortController` whose signal is threaded into every in-flight LLM call. When the plugin unloads, the controller is aborted and all in-flight classifications are drained via `Promise.allSettled` before the plugin finishes tearing down — keeps reload from leaking pending requests that would later pollute downstream decisions.

**Unclassified strategy** (deployer-only):
The policy for tools in no family. Either `'ask'` (fail-safe) or `'allow'` (permissive). Configured in `cordis.yml` entry config; not exposed in the user settings page.

**Sandbox defaults**:
Map from each approval mode to the sandbox policy the plugin writes when switching into that mode. Four modes × three sandbox levels (`read-only` / `workspace-write` / `danger-full-access`).

**askReason**:
Template string for the approval dialog reason text. Supports `{tool}` / `{mode}` / `{family}` placeholders. Server-side generation — the plugin has no locale signal at render time, which is why the template is configurable rather than auto-localized.

**Default mode** (deployer-only):
The approval mode assigned to a new session when no override exists. Configured in `cordis.yml` entry config (field `default`); not exposed in the user settings page.

**Settings namespace `dsh-user-approval-mode`**:
The profile entry id under which the user-editable fields live: the nine
`Volatile`-wrapped Config fields (`editTools`, `shellTools`,
`readOnlyTools`, `autoAllowTools`, `readOnlyGitCommands`, `sandboxDefaults`,
`askReason`, `smartProvider`, `smartModel`) plus the deployer-only plain
fields (`default`, `unclassified`,
`smartExtraDangerPatterns`, `smartDangerPatterns`, `smartSessionMemory`,
`smartSessionMemoryTtlMs`, `smartTimeoutMs`, `smartClassifierPrompt`). User edits persist to the
profile's `cordis.patch.yml` user layer and apply live (no restart).
Resolution order: schema defaults → cordis `base` (deployer's
cordis.yml/patch) → user layer. The client binds it via
`ctx.configForms.get`; the settings-page slot id is `approval-mode`
(distinct from the entry id).

**Tool classification order**:
The full priority chain at the gate: `autoAllowTools` first, then `editTools`, then `shellTools`, then `readOnlyTools`, then `unclassified` strategy. A shell-family call additionally passes the read-only command fast-path before the mode's verdict is applied. A PTC sub-call runs the same chain under its real tool name; the `run_code` transport itself is caught by `autoAllowTools` and never reaches classification.

## Settings UI surface

**Settings section (slot)**:
The DSH slot `settings.section` is occupied by this plugin. The page slot id is `approval-mode`, displayed under the user's locale text "Approval Modes" / "审批模式". Lives in the sidebar between the General and Plugins sections. The page binds the entry's configuration form (`ctx.configForms.get<Config>('dsh-user-approval-mode')`) — DSH 0.1.7 replaced `settingsScope`/`installSection` with volatile Config fields plus `configForms`.

## DSH dependency line

Peer ranges target the DSH `0.2.1-rc.2+` line (15 peers, all `^0.2.1-rc.2`); devDependencies track the line the plugin is verified against (pinned exactly to `0.2.2-rc.1` as of `0.11.0`), so the local typecheck compiles against the target runtime while the published peer floor stays wide enough to admit every `0.2.x` host from `0.2.1-rc.2` onward (including `0.2.2-rc.1` and later `0.2.2`/`0.2.x` prereleases). The floor is `0.2.1-rc.2`, deliberately not the corridor guide's suggested `^0.2.1-rc.1`: pinning the line the plugin is verified against removes any dependence on resolver behaviour (`^0.2.1-rc.1` resolved to `0.2.1-rc.1`, not rc.2 — pnpm 11 quarantines versions published within `minimumReleaseAge`, and `pnpm-workspace.yaml` now exempts the DSH scope by name and states the window explicitly; the 0.2.2 corridor also exempts `@deepseek-ai/cordis*`, `@deepseek-ai/cosmokit` and `@deepseek-ai/schemastery`, which the rc.1 line ships inside the same window). The peer set was measured, not derived, with the host's own `evaluatePluginCompatibility`: it passes at `0.2.1-rc.5` and at `0.2.2-rc.1`, while a control manifest that pins only `dsh-tools` to `0.2.1-rc.5` is rejected at `0.2.2-rc.1`. npm/pnpm's default prerelease rules do not admit a `0.2.2` prerelease from a `^0.2.1-rc.2` range, so installing on such a host can print unmet-peer warnings for the fifteen peers; the host gate — which evaluates with `includePrerelease: true` — is the judge, not the resolver warning. Note that the host evaluates ranges with `includePrerelease: true`, so `^0.2.1` (no prerelease) actually passes at `0.2.2-rc.1` even though the corridor guide's table says otherwise; `^0.2.1-rc.2` remains the shipped floor because it also excludes `0.2.1-rc.1`. `cordis` and `schemastery` are the one place where dev pins and peers diverge: devDependencies pin the host's versions exactly (`4.1.0` / `3.19.0`, because every consumed `0.2.2-rc.1` package declares `@deepseek-ai/cordis: ~4.1.0`, and `@deepseek-ai/schemastery: ~3.19.0` wherever it declares one at all — `dsh-settings`), while peer ranges stay `>=4.0.5` / `>=3.18.5` so a `0.2.1-rc.x` host still satisfies them; the compatibility gate only judges names matching `@deepseek-ai/dsh*`. This package is a **bundle** (`dsh.bundle.patch`), so a gate rejection skips the entire bundle rather than one row. `0.6.0` is the last release for the DSH `0.1.7` line and `0.8.0` the last for `0.2.0-rc.1`; neither older range admits the 0.2.1 line, so plugin and host must move together. The `^0.2.1-rc.2` floor also means an `0.2.1-rc.1` host is rejected — the trade accepted in exchange for a dependency line that does not depend on resolver quirks.

## Distribution

Published on GitHub only (`dsh plugin --profile web add github:R-LEI2536/dsh-user-approval-mode`), never on a registry. Two consequences shape the repository.

**The built `lib/` is committed.** A git-hosted dependency is fetched and packed: whatever the checkout holds is what the user runs, and nothing builds it afterwards. `prepare` is therefore deliberately absent from `package.json` — pnpm runs a git dependency's `prepare` inside the fetched checkout, which would pull the whole devDependency tree (native `lightningcss` binary included), need authorization for a dependency build script, and hinge on the user's registry accepting this repo's lockfile: the market's `git-prepare-not-allowed` / `git-prepare-failed` corridor. The bundle is built here (`pnpm build`), committed, and used as-is — so a `src/` edit, a rebuild and the `lib/` commit belong to the same change. `.gitattributes` pins `lib/**` to `-text`, because a Windows checkout with `core.autocrlf=true` would otherwise rewrite the committed bytes into a "modified" state.

**`files` must list `cordis.patch.yml`.** DSH treats a bundle's patch file as required: `loadOverlayPatches` throws when it cannot be read, `loadProfileDirectory` catches that and records the bundle in `skippedBundles`, and the only trace is one `skipping profile bundle` line on stderr. A `files` whitelist holding just `lib/` drops the patch from the packed package, and the bundle then mounts nothing at all — no approval-mode chip, no settings section. Same symptom as a missing `lib/`, different cause; both are install-path defects that `src/` cannot show.

**`files` must list `skills/`.** The bundled skill is read from the package when the provider registers. A whitelist that drops `skills/` still loads the plugin and keeps the gate working, but `registerApprovalShellSkill` logs `approval shell style skill unavailable` and contributes no skill — the same install-path class as the missing patch, and why `test/approval-skill.test.ts` pins the whitelist entry instead of trusting the layout.

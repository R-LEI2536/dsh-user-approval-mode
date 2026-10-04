# dsh-user-approval-mode

Approval-mode policy plugin for DeepSeek Harness. Decides, per tool call, whether the user must approve before execution. Sits at `tools/pre-execute` and returns `{ kind: 'ask' }` when the active mode and the tool's family together demand approval.

## Language

**ApprovalMode**:
The strategic stance a session runs under. Drives the gate at `tools/pre-execute`.
_Avoid_: "permission mode", "policy mode"

**Request mode**:
Strictest. Edit family, shell family, and unclassified tools all require approval; read-only family exempt.

**Auto-edit mode**:
Edit family auto-approved; shell family and unclassified require approval; read-only family exempt.

**Smart mode**:
The shell upgrade of auto-edit. Edit family auto-approved; read-only family exempt; `other` family follows `unclassified`. Shell family is routed through a four-step pipeline (danger list → session memory → LLM classifier → fail-safe) — dangerous commands are forwarded to manual review; approved calls are auto-allowed and remembered for the session's TTL; timeout / protocol errors / non-approve verdicts always fall back to manual review.

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

**Other (family)**:
Tools that fall in no configured family; behavior controlled by the `unclassified` strategy.

**Family list**:
One of `editTools`, `shellTools`, `readOnlyTools`. The three lists are mutually exclusive — a tool name belongs to at most one of them. UI shows a soft warning text reminding the user not to overlap; runtime fallback priority when overlap exists is `edit > shell > readonly > other`.
_Avoid_: "classification set", "category list"

**autoAllowTools**:
Tool names that bypass approval regardless of family classification (`ask_user_question` / `exit_plan_mode` plus the control-and-orchestration tools `job_output` / `skill` / `subagent` / `present` / `wait_agent` / `send_message` / `team_task_update` / `team_task_list` by default). Checked BEFORE family lookup, so overlap with any family list is harmless (redundant, not conflicting). These four lists are the plugin's schema defaults (`src/index.ts`), pinned by `test/tool-family-defaults.test.ts`.

**Smart classifier pipeline** (smart mode, shell family only):
The four ordered steps the smart-mode shell classifier runs on every shell call: (1) **danger list** — a deterministic regex set; any match hands off to manual review before the LLM is consulted. (2) **session memory** — a per-session `sha256(toolName + rawArguments)` map; a hit auto-approves without re-running the classifier. (3) **LLM classifier** — one-shot chat call to a configurable LLM returning `{"verdict":"approve"}` or `{"verdict":"ask"}`; only `approve` auto-allows. (4) **fail-safe fallback** — every unexpected outcome (timeout, protocol violation, missing seam, exception, non-approve verdict) routes to manual review. One additional guard sits after step 2 and before step 3: when the newest genuine user message exceeds the 2000-character budget, the gate short-circuits with `detail=latest-user-message-too-long` and skips the LLM call — session memory still wins because the guard is positioned AFTER the memory lookup, mirroring `dsh-auto-approve`.

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
The profile entry id under which the user-editable fields live: the eight
`Volatile`-wrapped Config fields (`editTools`, `shellTools`,
`readOnlyTools`, `autoAllowTools`, `sandboxDefaults`, `askReason`,
`smartProvider`, `smartModel`) plus the deployer-only plain fields
(`default`, `unclassified`, `smartExtraDangerPatterns`,
`smartDangerPatterns`, `smartSessionMemory`, `smartSessionMemoryTtlMs`,
`smartTimeoutMs`, `smartClassifierPrompt`). User edits persist to the
profile's `cordis.patch.yml` user layer and apply live (no restart).
Resolution order: schema defaults → cordis `base` (deployer's
cordis.yml/patch) → user layer. The client binds it via
`ctx.configForms.get`; the settings-page slot id is `approval-mode`
(distinct from the entry id).

**Tool classification order**:
The full priority chain at the gate: `autoAllowTools` first, then `editTools`, then `shellTools`, then `readOnlyTools`, then `unclassified` strategy.

## Settings UI surface

**Settings section (slot)**:
The DSH slot `settings.section` is occupied by this plugin. The page slot id is `approval-mode`, displayed under the user's locale text "Approval Modes" / "审批模式". Lives in the sidebar between the General and Plugins sections. The page binds the entry's configuration form (`ctx.configForms.get<Config>('dsh-user-approval-mode')`) — DSH 0.1.7 replaced `settingsScope`/`installSection` with volatile Config fields plus `configForms`.

## DSH dependency line

Peer and dev ranges target the DSH `0.2.0-rc.1+` line (`^0.2.0-rc.1`; 15 peers plus the same 15 as devDependencies). `cordis` and `schemastery` deliberately stay on `>=4.0.4` / `>=3.18.4`: the host's compatibility gate only judges names matching `@deepseek-ai/dsh*`, and both libraries are unchanged across the 0.1.7 → 0.2.0 corridor. This package is a **bundle** (`dsh.bundle.patch`), so a gate rejection skips the entire bundle rather than one row. `0.6.0` is the last release for the DSH `0.1.7` line; the range does not admit `0.1.7`, so plugin and host must move together.
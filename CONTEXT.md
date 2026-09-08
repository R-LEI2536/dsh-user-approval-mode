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
Tools that modify files (`write` / `edit` / `str_replace_editor` by default).

**Shell family**:
Tools that execute commands (`bash` / `pwsh` by default).

**Read-only family**:
Tools that only read state — exempt from approval in every mode. `autoAllowTools` is checked before the family check, so `readOnly` is a fall-through exemption while `autoAllow` is an explicit one.

**Other (family)**:
Tools that fall in no configured family; behavior controlled by the `unclassified` strategy.

**Family list**:
One of `editTools`, `shellTools`, `readOnlyTools`. The three lists are mutually exclusive — a tool name belongs to at most one of them. UI shows a soft warning text reminding the user not to overlap; runtime fallback priority when overlap exists is `edit > shell > readonly > other`.
_Avoid_: "classification set", "category list"

**autoAllowTools**:
Tool names that bypass approval regardless of family classification. Checked BEFORE family lookup, so overlap with any family list is harmless (redundant, not conflicting).

**Smart classifier pipeline** (smart mode, shell family only):
The four ordered steps the smart-mode shell classifier runs on every shell call: (1) **danger list** — a deterministic regex set; any match hands off to manual review before the LLM is consulted. (2) **session memory** — a per-session `sha256(toolName + rawArguments)` map; a hit auto-approves without re-running the classifier. (3) **LLM classifier** — one-shot chat call to a configurable LLM returning `{"verdict":"approve"}` or `{"verdict":"ask"}`; only `approve` auto-allows. (4) **fail-safe fallback** — every unexpected outcome (timeout, protocol violation, missing seam, exception, non-approve verdict) routes to manual review.

**Danger list**:
The 13 built-in regex sources in `src/smart-danger-patterns.ts` (`rm -rf /`, `dd of=/dev/`, `mkfs`, force-push, `curl|sh`, drop database, `truncate`, `shutdown`/`reboot`/`halt`, `chmod -R 777 /`, fork bomb, `terraform`/`pulumi destroy`). Compiled case-insensitively at startup; the deployer may append `smartExtraDangerPatterns` via cordis. Not exposed in the settings page.

**Smart session memory**:
Per-session `Map<sha256(toolName + rawArguments), { source: 'classifier' | 'human'; at: number }>`. TTL defaults to 30 minutes (`smartSessionMemoryTtlMs`); each session is bounded at 200 entries FIFO. Entries written by classifier approval or by the human granting an escalated ask; remembered as `'classifier'` or `'human'` source. Cross-session isolation is mandatory — a remember in session A is invisible to session B.

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

**Settings namespace `approval-mode`**:
The namespace that owns the user-editable fields (six tool-family / sandbox / dialog knobs plus three smart fields: `smartProvider`, `smartModel`, `sandboxDefaults.smart`) and the deployer-only fields (`default`, `unclassified`, `smartExtraDangerPatterns`, `smartSessionMemory`, `smartSessionMemoryTtlMs`, `smartTimeoutMs`, `smartClassifierPrompt`). Resolution order: schema defaults → cordis `base` → user layer. User overrides (where applicable) apply live (no restart).

**Tool classification order**:
The full priority chain at the gate: `autoAllowTools` first, then `editTools`, then `shellTools`, then `readOnlyTools`, then `unclassified` strategy.

## Settings UI surface

**Settings section (slot)**:
The DSH slot `settings.section` is occupied by this plugin. The page id is `approval-mode`, displayed under the user's locale text "Approval Modes" / "审批模式". Lives in the sidebar between the General and Plugins sections.
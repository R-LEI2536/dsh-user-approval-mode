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

**Unclassified strategy** (deployer-only):
The policy for tools in no family. Either `'ask'` (fail-safe) or `'allow'` (permissive). Configured in `cordis.yml` entry config; not exposed in the user settings page.

**Sandbox defaults**:
Map from each approval mode to the sandbox policy the plugin writes when switching into that mode. Three modes × three sandbox levels (`read-only` / `workspace-write` / `danger-full-access`).

**askReason**:
Template string for the approval dialog reason text. Supports `{tool}` / `{mode}` / `{family}` placeholders. Server-side generation — the plugin has no locale signal at render time, which is why the template is configurable rather than auto-localized.

**Default mode** (deployer-only):
The approval mode assigned to a new session when no override exists. Configured in `cordis.yml` entry config (field `default`); not exposed in the user settings page.

**Settings namespace `approval-mode`**:
The namespace that owns the six user-editable fields plus the two deployer-only fields (`default`, `unclassified`). Resolution order: schema defaults → cordis `base` → user layer. User overrides (where applicable) apply live (no restart).

**Tool classification order**:
The full priority chain at the gate: `autoAllowTools` first, then `editTools`, then `shellTools`, then `readOnlyTools`, then `unclassified` strategy.

## Settings UI surface

**Settings section (slot)**:
The DSH slot `settings.section` is occupied by this plugin. The page id is `approval-mode`, displayed under the user's locale text "Approval Modes" / "审批模式". Lives in the sidebar between the General and Plugins sections.
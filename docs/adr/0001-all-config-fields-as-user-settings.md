# All eight Config fields exposed as user settings

Status: accepted.

Previously, only `default` was end-user-editable (via the settings namespace
`approval-mode`); the other seven Config fields — `editTools`, `shellTools`,
`readOnlyTools`, `autoAllowTools`, `unclassified`, `sandboxDefaults`,
`askReason` — were deployer-only, settable in cordis.yml. We now expose all
eight in the same settings namespace, layering user values over the cordis
`base`. The runtime `cfg` was refactored from a frozen object into a thunk
that re-reads the settings scope on every tool call.

## Considered options

1. **Family lists only (5 fields)** — keep `sandboxDefaults` and `askReason`
   as deployer concerns. Security posture (sandbox) and brand text
   (`askReason`) stay at the deployer layer.
2. **Family lists + sandboxDefaults (6 fields)** — let users tweak the
   sandbox policy per mode, but keep `askReason` deployer-only.
3. **All eight fields** (chosen) — full symmetry: every Config field that
   lives in cordis also lives in the user's settings page.

## Why option 3

The user requested full editability explicitly. The boundary shift cost
(`sandboxDefaults` and `askReason` become per-user instead of per-deployer)
is acceptable because:

- `sandboxDefaults` still layers over a deployer-defined `base` — the
  deployer can pin a security floor the user can't go below by omitting the
  override.
- `askReason` remains a free-text template; the deployer's default is the
  `base`, and user overrides are scoped to the individual user.
- The existing `default` field already established the precedent that this
  plugin exposes config to end-users via settings.
- Symmetry is cheaper to reason about than per-field policy: every Config
  field behaves the same way (deployer base + user override), so the
  documentation needs no "this one is special" exception.

## Consequences

- The `approval-mode` settings namespace schema is the full `Config` schema
  (previously narrowed to `{ default }`). Deployers who registered older
  client versions keep their `default` override; the schema upgrade is
  backward-compatible because the new schema strictly adds fields with
  defaults.
- Runtime `cfg` refactored from a frozen object to a closure that reads the
  settings scope on every `tools/pre-execute` invocation, so user edits
  take effect on the next tool call without a restart.
- Settings page (`settings.section` slot, id `approval-mode`, order 1100 —
  after the Plugins section) gains controls for `sandboxDefaults` (3 rows of
  mode/dropdown) and `askReason` (textarea), in addition to the existing
  `default` and the four tool family lists.
- Two configuration surfaces that were previously deployer-only are now
  also user-facing: `sandboxDefaults` (per-user security posture) and
  `askReason` (per-user approval dialog copy). The README's "Configuration"
  section should call these out as user-overridable.

## Known follow-ups

- The `cordis.patch.yml` shipped defaults for `readOnlyTools` use
  `list_directory` + `todo_write`, but the runtime schema defaults to
  `list_dir`. Not part of this change; tracked separately.
- README documents the new settings page in its own section.
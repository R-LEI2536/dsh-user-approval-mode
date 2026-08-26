# Approval-mode user settings — six fields exposed, two deployer-only

Status: accepted (revised — see "Revision history").

Six of the eight Config fields are exposed as user-editable settings under the
namespace `approval-mode`: `editTools`, `shellTools`, `readOnlyTools`,
`autoAllowTools`, `sandboxDefaults`, `askReason`. The other two — `default`
and `unclassified` — stay deployer-only, set in `cordis.yml` entry config.

User values layer over the cordis `base`; Reset on a field clears the user
override and re-inherits the base. The runtime `cfg` was refactored from a
frozen object into a thunk that re-reads the settings scope on every tool
call.

## Considered options

1. **Family lists only (4 fields)** — keep `sandboxDefaults`, `askReason`,
   `default`, and `unclassified` as deployer concerns. Smallest surface but
   omits obvious user knobs (sandbox per mode, dialog copy).
2. **Family lists + sandboxDefaults + askReason (6 fields, current)**
   — let users tweak tool classification, sandbox policy per mode, and the
   approval dialog template; keep `default` and `unclassified` deployer-only.
3. **All eight fields** — full symmetry: every Config field that lives in
   cordis also lives in the user's settings page.

## Why option 2

The user requested UI exposure of as many fields as practical, but two
specific knobs are deliberately kept at the deployer layer:

- **`default`** is a once-per-deployment choice; surfacing it invites end
  users to flip it accidentally and creates per-session inconsistency.
- **`unclassified`** is a fail-safe knob the deployer picks intentionally;
  end users have no basis to choose between fail-safe and permissive.

The boundary shift for the other six is acceptable because:

- `sandboxDefaults` still layers over a deployer-defined `base` — the
  deployer can pin a security floor the user can't go below by omitting the
  override.
- `askReason` remains a free-text template; the deployer's default is the
  `base`, and user overrides are scoped to the individual user.
- The four tool family lists are the core of the plugin's behavior and
  obviously belong in user space.
- Symmetry within the user-editable set is cheaper to reason about: every
  exposed Config field behaves the same way (deployer base + user override).

## Consequences

- The `approval-mode` settings namespace schema is the full `Config` schema
  (previously narrowed to `{ default }`). The schema upgrade is
  backward-compatible because the new schema strictly adds fields with
  defaults. The settings layer can technically hold user overrides for
  `default` and `unclassified`, but the UI does not expose controls for
  them — those two values always come from the cordis `base`.
- Runtime `cfg` refactored from a frozen object to a closure that reads the
  settings scope on every `tools/pre-execute` invocation, so user edits
  take effect on the next tool call without a restart.
- Settings page (`settings.section` slot, id `approval-mode`, order 1100 —
  after the Plugins section) renders three sub-sections: Tool family
  classification (one comma-separated text input per family, with set
  semantics — trim, dedup on commit), Sandbox policy (one dropdown per
  mode), and Approval prompt (textarea).
- Two configuration surfaces that were previously deployer-only are now
  also user-facing: `sandboxDefaults` (per-user security posture) and
  `askReason` (per-user approval dialog copy).

## Revision history

- **Revision 1** (initial): proposed option 3 — expose all eight Config
  fields. Rejected during implementation review on UX grounds: the
  `default` and `unclassified` controls add two extra sub-section rows
  without giving end users a meaningful lever. Revised to option 2 (six
  fields); the two removed fields stay in the Config schema and remain
  settable via `cordis.yml`.

## Known follow-ups

- README documents the new settings page in its own section.
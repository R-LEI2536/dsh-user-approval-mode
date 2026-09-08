# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`smartDangerPatterns` deployer-only field** — `string[] | null` (default
  `null`). When non-null, REPLACES the built-in 13 danger patterns entirely
  before `smartExtraDangerPatterns` is appended on top. Mirrors the
  `dangerPatterns` switch on `dsh-auto-approve`. Cordis-only; not exposed in
  the settings page. Deployment example:

  ```yaml
  - id: dsh-user-approval-mode
    config:
      smartDangerPatterns:
        - '\bkubectl\s+delete\b'
        - '\bdsh\s+plugin\s+add\b'
      smartExtraDangerPatterns: []
  ```

- **Smart-gate decision logger** — every smart-mode shell verdict now
  emits one line via `ctx.logger.info`, format
  `[dsh-user-approval[smart]] decision=<ask|allow> <detail>`. Logger
  failures are swallowed so a broken logger never changes an approval
  outcome. The vocabulary matches the gate's public `ask|allow` kinds
  so deployers can `grep "decision=ask"` to surface every classifier
  escalation.

### Changed

- **`latestUserMessage` overflow short-circuits in smart mode** — when the
  newest genuine user message exceeds the 2000-character budget, the
  classifier pipeline now skips the LLM call and routes directly to
  manual review with `detail=latest-user-message-too-long`. The guard sits
  AFTER the session-memory lookup (so a remembered grant still wins)
  and BEFORE the LLM call (so we never invoke the model on truncated
  trusted context). Mirrors `dsh-auto-approve`'s posture exactly.

### Fixed

- **Sandbox reset leaves orphan `custom` preset state** — when a user
  manually picked a non-workspace-write permission preset (e.g.
  `danger-full-access`) and then ran `/approval-mode <mode>`, the
  plugin wrote `sandbox/mode: workspace-write` but left the prior
  `approval/policy: never` in place. The resulting
  `workspace-write + never` combination matches no preset, so
  `dsh-permission-presets`' UI chip rendered `custom`. The fix
  delegates the sandbox-mode change to `permissionPresets.set()`
  when a preset matching `(sandbox, ask)` exists, restoring the named
  preset in one shot. The `off` mode keeps the direct `sandbox/mode`
  write (no preset bundle — off is "I don't care about presets"). Falls
  back to direct `sandbox/mode` write when `permission-presets` isn't
  mounted or no preset matches (e.g. deployer customized
  `sandboxDefaults` to `read-only`).
- New helper module `src/permission-presets-helper.ts` and 8-case test
  `test/permission-presets-helper.test.ts` cover the preset-pick logic.

## [0.4.0] - 2026-09-08

### Added

- **Smart mode** — a fifth approval mode that routes shell-family tool calls
  through a four-step classifier pipeline (danger list → session memory →
  LLM classifier → fail-safe) instead of always asking. Dangerous commands
  are forwarded to human review via the danger list; routine ones are
  auto-approved by the LLM and remembered for the session's TTL window;
  every unexpected outcome (timeout, protocol error, missing seam,
  non-`approve` verdict) falls back to manual review. Edit / readonly /
  `other` families are unchanged, so smart mode is functionally
  `auto-edit` with a shell upgrade.
- **Smart classifier pipeline** — `src/smart-classifier.ts` plus the
  verbatim-ported `src/smart-danger-patterns.ts` (13 built-in regex
  sources) and `src/smart-prompt.ts` (the safety contract prompt). The
  classifier integrates at `tools/pre-execute` and reads
  `exec.arguments` directly (no session-events lookup needed for this
  plugin's waterfall).
- **Settings page: Smart classifier sub-section** — new sub-section for
  two user-editable fields (`smartProvider`, `smartModel`) plus a new
  dropdown in the existing Sandbox sub-section for `sandboxDefaults.smart`.
  Five other smart fields (`smartExtraDangerPatterns`,
  `smartSessionMemory`, `smartSessionMemoryTtlMs`, `smartTimeoutMs`,
  `smartClassifierPrompt`) stay deployer-only in `cordis.yml`.
- **cordis.patch.yml** declares `sandboxDefaults.smart: workspace-write`
  by default; the other five smart fields are omitted so deployers
  inherit schema defaults.
- **Plugin lifetime signal** — `ctx.effect()` registers an
  `AbortController` whose signal threads into every in-flight LLM
  classification. Plugin reload aborts pending calls and awaits them
  via `Promise.allSettled` before tearing down.
- **Unit tests** — `test/` directory with five `node --test` files
  (`tsx` loader, no extra peer deps). 47 tests cover the danger
  patterns, classifier verdict parsing, streaming aggregator, session
  memory, and the full smart-shell evaluator with a mocked LLM seam.
  Run with `pnpm test`.
- **ADR-0002** — `docs/adr/0002-smart-mode-shell-classifier.md` records
  the pipeline design, the deployer/user field split, and the verbatim
  port from `dsh-auto-approve`.

### Changed

- **Approval modes: four → five.** `ApprovalMode` and `APPROVAL_MODES`
  gain `'smart'` between `'auto-edit'` and `'yolo'`. The settings page,
  the chip menu, and the `/approval-mode` slash command all pick up the
  new value automatically.
- **`sandboxDefaults` key set widens** from `'request' | 'auto-edit' | 'yolo'`
  to `'request' | 'auto-edit' | 'smart' | 'yolo'`. Off-mode still
  restores the composition default.
- **Dependencies** — added `tsx` devDep (loader for `node --test`) and
  `@types/node` (for `node:crypto` in `smart-classifier.ts`). No new
  peer / runtime deps.

### Documentation

- `CONTEXT.md` adds glossary entries for **Smart mode**, **Smart
  classifier pipeline**, **Danger list**, **Smart session memory**,
  **Smart classifier prompt**, **Smart LLM seam**, **Smart lifetime
  signal**. The Settings namespace entry is updated to enumerate the
  new user-editable and deployer-only fields.
- `README.md` adds the Smart mode row to the Approval Modes table, the
  new "Smart Mode (NEW)" detail section, the three new user-editable
  fields in the Configuration table, and a "Smart Mode Risks"
  subsection under Known Limitations.
- New `pnpm test` script; existing `pnpm build` script unchanged.

## [0.3.2] - 2026-09-03

### Changed

- **DSH floor raised to `>=0.1.2-rc.1`** — sixteen `@deepseek-ai/dsh-*` peer+dev deps now require `>=0.1.2-rc.1` (was `>=0.1.2-alpha.3`). The harness itself ships under `0.1.2-rc.1` now, so the bump keeps the auto-tracking promise from v0.3.1 honest. The `pnpm-workspace.yaml` `minimumReleaseAgeExclude` list is also moved to the `0.1.2-rc.1` line; `dsh-system-prompt` stays under-pinned at `0.1.1-rc.2` (unchanged — the alpha line moved past it and `rc.1` is still rc-line for `dsh-system-prompt`).
- **No source change** — every API surface this plugin depends on (`ctx.sandboxPolicy.overrideOf(session)`, `setSandboxMode(session, mode)`, `ctx.settings.installSection(...)`, the `Context` / `SettingsScope` / `SessionId` / `SessionEvent` import paths, and the `dsh-client-modules` boundary) kept the same shape across the upstream `alpha.4`, `alpha.5`, and `rc.1` releases. The only breaking refactor in that range (`refactor(session)!: distinguish event seqs from log offsets`) only added brand separation between `SessionSeq` and `SessionLogOffset`; the plugin reads `session.events` as an array and never touches the numbered fields, so the new brands do not surface at any call site.

## [0.3.1] - 2026-09-01

### Changed

- **Peer dependencies widened to `>=`** — all 16 `@deepseek-ai/dsh-*` peer+dev deps, `@deepseek-ai/cordis`, and `@deepseek-ai/schemastery` are now pinned `>=X.Y.Z` (no upper bound) instead of `^X.Y.Z`. The plugin auto-tracks every new upstream release from `>=0.1.2-alpha.3` onward, including future majors. Trade-off: breaking changes from a DSH major bump (e.g. `0.2.0` API redesign) land automatically; we accept this and rely on test/build catching the regression before release.
- **`pnpm-workspace.yaml` overrides trimmed** — the 17 `0.1.2-alpha.3` overrides (which pinned the entire DSH transitive tree to a single version) are removed because they defeat the auto-update strategy above. `dsh-system-prompt` stays pinned to `0.1.1-rc.2` (intentional under-pin — the alpha line moved on and 0.1.1-rc.2 is the last known-stable point for it).
- **Dropped unused peer dep** — `@deepseek-ai/dsh-session-projection` had a `import type {}` placeholder but no actual `ctx.sessionProjections` call site anywhere; removed from `package.json`, `pnpm-workspace.yaml`, and `src/index.ts`.

## [0.3.0] - 2026-09-01

### Fixed

- **Plugin rename** — `package.json` `name` and `cordis.patch.yml` id/name changed from `dsh-user-approval` to `dsh-user-approval-mode`. Aligns the plugin identifier with the existing internal names (`approval-mode` settings namespace, `/approval-mode` command, `dsh-user-approval-mode*` locale namespaces) and disambiguates from the official `@deepseek-ai/dsh-user-approval` package (the `ask`/`never` policy primitive). The on-disk directory stays at `dsh-user-approval/` to keep the workspace path stable for the harness loader.
- **DSH 0.1.2-alpha.3 compatibility** — `@deepseek-ai/dsh-sandbox-policy` removed the `effectiveSandboxMode(events)` export (now folded into a session-projection unit on `ctx.sandboxPolicy`). Replaced the import and the one call site in `applyMode` with `ctx.sandboxPolicy.overrideOf(session)`, semantics preserved (last logged `sandbox/mode` for the session, or `undefined`). The cast on `ctx.get('sandboxPolicy')` now also types `overrideOf` so the new call site compiles. Off-mode semantics unchanged: when the session's current override already equals the composition default, no redundant `sandbox/mode` event is written.
- **DSH 0.1.2-alpha.3 client migration** — `@deepseek-ai/dsh-client-runtime` was renamed to `dsh-client-modules` and is being deprecated. Moved `ClientContext` (now aliased `Context` from `@deepseek-ai/cordis`), `SessionId` (now from `@deepseek-ai/dsh-session/types`), and `SettingsScope` (now from `@deepseek-ai/dsh-client-ui-settings/client`) to the new locations. Dropped `dsh-client-runtime` from peer/dev deps; runtime/type behavior is unchanged because the old names were type-only.
- **Locale namespace rename** — the chip + settings page dictionaries were registered under `approval` / `approval-page`, which collides with the official `@deepseek-ai/dsh-client-ui-approval` (harness-loaded) on locale registration (`locale namespace "approval" already has locale "zh"`). Renamed to `dsh-user-approval-mode` / `dsh-user-approval-mode-page` to keep the plugin namespaced. Settings namespace `approval-mode` is unchanged (no collision there).

## [0.2.0] - 2026-08-26

### Added

- **Web UI Settings page** — new "Approval Modes" entry in the sidebar (after Plugins) lets users edit six Config fields: the four tool family lists, the sandbox defaults per mode, and the approval prompt template. User values layer over the deployer's cordis config (the settings `base`); pressing Reset on a field clears the user override and re-inherits the base. The `default` mode and the `unclassified` strategy are deliberately deployer-only — they live in `cordis.yml` entry config.
- **New peer dependency** — `@deepseek-ai/dsh-client-ui-settings` (>= 0.1.0-rc.8) hosts the `settings.section` slot and the `ctx.settingsScope` service the page consumes.

### Changed

- **`cfg` is settings-driven** — the previously frozen cordis config is now a thunk that reads the resolved settings section on every `tools/pre-execute`, so edits to `editTools` / `shellTools` / `readOnlyTools` / `autoAllowTools` / `sandboxDefaults` / `askReason` all take effect on the next tool call without a restart. The deployer-only `default` and `unclassified` fields still layer over the cordis `base` via the same scope; their values flow through `cfgThunk()` with `??` fallbacks.
- **`installSettingsSection` schema** is the full `Config` (previously narrowed to `{ default }`); the previous user override on `default` remains valid under the broader shape.
- **Schema descriptions** are now attached to every Config field via `schemastery .description(...)`; the client page renders them as the hint paragraph under each field's control.
- **Tool family widgets** are compact comma-separated text inputs (`CsvInput`) instead of row lists — one input per family, set semantics (trim each token, drop empties, deduplicate on commit). The placeholder `{write, edit, str_replace_editor}` uses set notation to signal that order is irrelevant. Commits defer to blur so the caret stays where the user puts it.
- **Sandbox dropdown labels** display in English (`Read-only` / `Workspace write` / `Danger full access`) in both `en` and `zh` locales — these are technical identifiers shared with the schema values.
- **Settings page no longer exposes `default` / `unclassified`** — those two are deployer-only. Page renders three sub-sections (Tool classification, Sandbox policy, Approval prompt) instead of four.
- **`readOnlyTools` schema default aligned with `cordis.patch.yml`** — was `['read', 'glob', 'grep', 'read_image', 'list_dir']`, now `['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write']`. Fixes a pre-existing drift where the schema default and the runtime cordis bundle differed. The settings page and the runtime gate both pick up the new default immediately. The `askReason` template default mirrors the change (`list_dir` → `list_directory`) so the dialog advice matches the runtime's safe list.
- **Settings page restyled to the DSH settings-panel design language** — page title + intro at the top, sub-sections rendered as cards (`--dsw-alias-border-l2`, `border-radius:10px`, `--dsw-alias-bg-base`) with fields inside, dropdown triggers carry a chevron that rotates 180° when open. All colours resolve through `--dsw-alias-*` semantic tokens so light and dark themes both render correctly. Tool family inputs and the approval-prompt textarea fill the card's content width (no more empty column on the right).

### Documentation

- `docs/adr/0001-all-config-fields-as-user-settings.md` records the boundary shift between deployer config and user preferences (six user-editable + two deployer-only), with a revision note documenting the UX-driven reduction from the original all-eight plan.
- README's "Settings Page" section documents the new page, its controls, the CsvInput widget, and the Reset semantics.

## [0.1.3] - 2026-08-26

### Added

- **Client-side per-session mode cache** — revisiting a previously-opened session now shows the cached mode on the first frame (no `'off'` flicker) and skips the `/approval-mode` roundtrip. Chip state changes (open/close menu, switch modes) no longer trigger redundant queries either.

### Changed

- **`pnpm-workspace.yaml` override** pins `dsh-system-prompt` to `0.1.1-rc.2`; the previously locked `0.1.0-rc.7` is no longer published, so fresh installs needed a fix.

### Removed

- **`dsh-commands` type workaround** for the upstream `0.1.0-rc.8` line; `execute`'s third parameter is correctly typed as `readonly EncodedImageAttachment[]`.
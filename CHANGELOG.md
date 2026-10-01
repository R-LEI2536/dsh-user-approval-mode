# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Widen the bundled default tool lists** — the plugin's bundle patch
  (`cordis.patch.yml`) now defaults `readOnlyTools` to
  `['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'reme_search', 'list_agents']`
  (adds `reme_search`, `list_agents`) and `autoAllowTools` to
  `['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent']`
  (adds `job_output`, `skill`, `subagent`), so read-only browsing and
  control-plane tools stop raising approval prompts under the shipped
  deployment. The **schema defaults in `src/index.ts` are deliberately left
  unchanged**: they remain the narrower fallback for a deployment that
  inserts the plugin without the bundle patch, so the two layers differ by
  design rather than by accident (contrast the drift fixed in 0.2.0).
  README.md and README.zh.md now attribute the lists to the bundle layer and
  spell out which layer a manual `insert` resolves to.

- **Bump `@rh854lkjd/dsh-tool-list-dir` floor to `>=0.2.6`** — 0.2.6
  tightens its peerDependencies to the DSH 0.1.7 era (`cordis ~4.0.4`,
  `dsh-fs`/`dsh-tools`/`dsh-system-prompt ^0.1.7-rc.1`, `schemastery
  ~3.18.4`), matching this plugin's 0.1.7-rc.* peers and clearing the
  old `dsh-fs@0.0.1-rc.1` transitive peer warning noted in 0.5.0. The
  peer bump also normalizes the tree's schemastery to 3.18.4, the
  version this repo always declared (`>=3.18.4`), which surfaced the
  annotation fix below.

### Fixed

- **Annotate the plugin Config schema as `Schema<Config, VolatileConfig>`**
  — under schemastery 3.18.4 the schema's inferred type carries
  `Volatile<T>` through `meta.default`, so the previous
  `Schema<Config>` annotation stopped compiling (input side still
  matches `Config`; the volatile chain makes the validated output
  `VolatileConfig`). Emitted `lib/index.d.ts` stays portable — it no
  longer needs to reference the undeclared `cosmokit` types.

## [0.6.0] - 2026-09-28

### Changed

- **Adapt to DSH 0.1.7-rc.1** — bump every `@deepseek-ai/dsh-*`
  peer/devDep range from `^0.1.5-rc.1` to `^0.1.7-rc.1`, cordis to
  `>=4.0.4`, schemastery to `>=3.18.4` (`.volatile()` ships in 3.18.4,
  the `Volatile` type in cordis 4.0.4).

- **Settings move into the profile plugin Config (DSH 0.1.7-J1-04)** —
  `ctx.settings.installSection` is gone. The plugin entry now declares
  the eight user-editable fields (`editTools` / `shellTools` /
  `readOnlyTools` / `autoAllowTools` / `sandboxDefaults` / `askReason` /
  `smartProvider` / `smartModel`) as `.volatile()` schema fields; user
  edits persist to the profile `cordis.patch.yml` user layer and apply
  live. The remaining eight fields (`default`, `unclassified`, the five
  `smart*` deployer knobs, `smartClassifierPrompt`) stay deployer-only
  plain values. `apply(ctx, config: VolatileConfig)` reads live
  `Volatile<T>` references through a per-call thunk (every decision call
  site unchanged) and declares its own settings presentation via
  `ctx.settings.configure({ auto: false })`. The new settings namespace
  is the profile entry id `dsh-user-approval-mode`; the settings-page
  slot id stays `approval-mode`.

- **Client settings transport renamed `settingsScope` → `configForms`
  (DSH 0.1.7-J1-27)** — `src/client/index.ts` injects `configForms`
  (dropping `settingsScope`/`settingsSchema`) and binds
  `ctx.configForms.get<Config>('dsh-user-approval-mode')`. The page
  component consumes `ConfigForm<Config>` (`set`/`unset` now return
  `Promise<boolean>`, same call shape).

- **Icon rename (DSH 0.1.7-J1-26)** — `IconChevronDownOutline14` →
  `IconChevronDownOutlineRegular` in both the composer chip
  (`ApprovalModeChip.tsx`) and the settings page
  (`ApprovalModeSettings.tsx`).

### Notes for next upgrade

- **Real-host verification still manual** — this checkout validates with
  typecheck / test / build against the 0.1.7-rc.* packages. Cold start on
  the actual host (its checkout is still 0.1.5-rc.2) and a settings save
  landing in the profile `cordis.patch.yml` user layer remain to be
  verified live.

## [0.5.0] - 2026-09-11

### Changed

- **Adapt to DSH 0.1.5-rc.1** — bump every `@deepseek-ai/dsh-*`
  peer/devDep range from `>=0.1.2-rc.1` to `^0.1.5-rc.1`. Add
  `@deepseek-ai/dsh-permission-presets@^0.1.5-rc.1` to peer and dev.
  `pnpm install` auto-extends `pnpm-workspace.yaml`'s
  `minimumReleaseAgeExclude` to cover the 0.1.5-rc.1 prerelease
  packages so the new pnpm 11 release-age gate does not block the
  install.

- **Tighten two `as` casts in `src/index.ts` to formal DSH types** —
  `sandboxPolicy` now imports `SandboxPolicyService` from
  `@deepseek-ai/dsh-sandbox-policy`; `permissionPresets` now imports
  `PermissionPresetService` from the new
  `@deepseek-ai/dsh-permission-presets`. Both `ctx.get()` call sites
  drop the structural cast; a future upstream signature drift will be
  caught at `pnpm typecheck` rather than at runtime. Per
  `DSH-0.1.5-UPGRADE-AUDIT.md` §3.4 and
  `docs/2026-09-09-dsh-v0-1-5-alpha-1-compatibility-audit.md` §3.2.

- **`src/permission-presets-helper.ts` re-shaped** — the helper now
  consumes `PermissionPresetService` directly. The local
  `PermissionPresetsServiceLike` interface and the `ApprovalPolicy`
  re-export are removed (no remaining call sites). `findAskPresetForSandbox`'s
  pure logic (loop, ASK_PRESET_APPROVAL match) is unchanged.

### Test changes

- **`test/permission-presets-helper.test.ts`** updated to mock the
  real `PermissionPresetService` shape (structural stub plus
  `as unknown as` cast at the boundary). All 80 tests still pass.

### Notes for next upgrade

- **Live verification deferred** — smart mode's six end-to-end
  scenarios (echo / repeated echo / `rm -rf` / `curl|sh` /
  `git push --force` / silent allow) need to run on a real DSH
  0.1.5-rc.1 server. Out of scope for this release; tracked
  separately.

- **`@rh854lkjd/dsh-tool-list-dir@0.2.4` transitive peer warning** —
  the package pulls `@deepseek-ai/dsh-fs@0.0.1-rc.1`, whose
  `^0.0.1-rc.1` peer range no longer matches
  `dsh-brand`/`dsh-invariants`/`dsh-llm`/`dsh-sandbox` at 0.1.5.
  Pre-existing latent issue (also present at 0.1.2-rc.1 — only
  surfaced now because `pnpm peers check` was new in the install).
  `dsh-tool-list-dir` is recommended from `README` only and is not
  `import`ed anywhere in `src/`; no functional impact. Tracked
  upstream at `R-LEI2536/dsh-tool-list-dir`.

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
- **`latestUserMessage` overflow short-circuits in smart mode** — when the
  newest genuine user message exceeds the 2000-character budget, the
  classifier pipeline now skips the LLM call and routes directly to
  manual review with `detail=latest-user-message-too-long`. The guard sits
  AFTER the session-memory lookup (so a remembered grant still wins)
  and BEFORE the LLM call (so we never invoke the model on truncated
  trusted context). Mirrors `dsh-auto-approve`'s posture exactly.

### Fixed

- **Documentation claimed a `'human'` source memory path that was never
  wired** — `CONTEXT.md` (`Smart session memory` section) and the
  `smartSessionMemory` schema description both stated entries could be
  written when "the human granting an escalated ask", but the smart gate
  sits at `tools/pre-execute` and never observes the downstream approval
  dialog outcome. The `'human'` source type stays in the memory API
  surface as a reserved slot, but no code path writes it today. Both
  spots now describe the classifier-only reality; a future DSH event
  could backfill the human source without API churn.
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
- **Session-memory cache keyed on the shell command, not the wrapper
  blob** — `smartMemoryKey` previously hashed the entire `args` JSON,
  so any tool-wrapper metadata (agent-supplied `description`, DSH-injected
  fields, `cwd`, …) made the cache miss for what was semantically the
  same shell call. Live-verified: two `echo hello` calls with different
  `description` values both reached `decision=allow detail=classifier`
  on the first invocation but never hit `detail=remembered` on the
  repeat — the memory write succeeded, the lookup key just never matched.
  Now keys on `args.command` (the same projection used to build
  classifier evidence), so `remembered` lookups succeed on identical
  commands. Mirrors the events-based lookup in
  `ref_codes/dsh-auto-approve-main/index.js`, which sees only the
  canonical `tool/call` arguments and not the wrapper extras.

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
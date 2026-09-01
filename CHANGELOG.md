# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
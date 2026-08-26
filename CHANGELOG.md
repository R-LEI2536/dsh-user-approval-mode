# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-08-26

### Added

- **Client-side per-session mode cache** — revisiting a previously-opened session now shows the cached mode on the first frame (no `'off'` flicker) and skips the `/approval-mode` roundtrip. Chip state changes (open/close menu, switch modes) no longer trigger redundant queries either.

### Changed

- **`pnpm-workspace.yaml` override** pins `dsh-system-prompt` to `0.1.1-rc.2`; the previously locked `0.1.0-rc.7` is no longer published, so fresh installs needed a fix.

### Removed

- **`dsh-commands` type workaround** for the upstream `0.1.0-rc.8` line; `execute`'s third parameter is correctly typed as `readonly EncodedImageAttachment[]`.
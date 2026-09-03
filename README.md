# dsh-user-approval-mode

**Version 0.2.0**

[中文](./README.zh.md)

User approval modes plugin for DeepSeek Harness. Provides four approval modes to control when tools require user confirmation before execution.

用户审批模式插件，为 DeepSeek Harness 提供四种审批模式，控制工具执行前是否需要用户确认。

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Demo

![Approval Mode Selector Demo](./assets/example.webp)


## Features

- **Four Approval Modes**: `request`, `auto-edit`, `yolo`, `off`
- **Web UI Mode Selector**: Quick-switch chip under the input box for changing approval modes without commands
- **Settings Page**: Configure six approval-mode options (tool family lists, per-mode sandbox policy, approval prompt template) in `Settings → Approval Modes`. The default mode and the unclassified strategy remain deployer-only (set in `cordis.yml`).
- **Tool Family Classification**: Automatically categorizes tools into edit, shell, readonly, and other families
- **Sandbox Integration**: Automatically adjusts sandbox policy when switching modes
- **Session-Scoped**: Each session maintains its own approval mode
- **In-Memory State**: Per-session mode stored in memory, resets to default on DSH restart
- **Slash Command**: Switch modes via `/approval-mode` command

## Approval Modes

The approval modes are inspired by [Qwen Code](https://github.com/QwenLM/Qwen-Code).

| Mode | Edit Tools | Shell Tools | Other Tools | Read-Only Tools | Use Case |
|------|-----------|-------------|-------------|----------------|----------|
| `request` | Ask | Ask | Ask | Allow | Maximum security, all modifications require approval |
| `auto-edit` | Allow | Ask | Ask | Allow | Balanced, automatic file editing with shell oversight |
| `yolo` | Allow | Allow | Allow | Allow | No approval needed, full automation |
| `off` | Allow | Allow | Allow | Allow | Disabled, restore default DSH behavior |

### Mode Details

#### `request` - Maximum Security
- **Behavior**: All edit, shell, and unclassified tools require approval
- **Sandbox**: Automatically switches to `workspace-write`
- **Use Case**: High-security environments, production systems, or when working with critical files

#### `auto-edit` - Balanced Mode
- **Behavior**: Edit tools auto-approve, shell and unclassified tools require approval
- **Sandbox**: Automatically switches to `workspace-write`
- **Use Case**: Development environments where file modifications are trusted but shell commands need oversight

#### `yolo` - Full Automation
- **Behavior**: No approval required for any tool
- **Sandbox**: Automatically switches to `workspace-write`
- **Use Case**: Trusted environments, rapid prototyping, or when you want full automation

#### `off` - Disabled
- **Behavior**: Plugin disabled, restore default DSH approval behavior
- **Sandbox**: Restores to composition default
- **Use Case**: Temporarily disable the plugin without uninstalling

**Note**: When switching approval modes, the sandbox mode is automatically adjusted to the configured default value. This will override any previous manual sandbox adjustments you made. If you wish to use a different sandbox mode with the new approval mode, you can manually adjust the sandbox again after switching.

## Installation

### From GitHub

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-user-approval-mode
```

### From Local Directory (Development)

```bash
dsh plugin --profile web add /path/to/dsh-user-approval
```

## Known Limitations

### Session Restart Behavior

This plugin uses an **in-memory storage** approach to avoid compatibility issues with DSH session event types. As a result:

- ✅ **Sessions load successfully** after DSH restart (no compatibility issues)
- ⚠️ **Approval mode resets to default** after DSH restart (backend WeakMap cleared)
- ✅ **UI syncs from server** on browser refresh, reflecting actual mode
- ✅ **Approval mode persists** during the current session

**Why this design?**
- DSH currently does not support custom event types in plugins
- Writing custom events would cause `SessionFormatUnsupportedError` after restart
- In-memory storage ensures sessions remain compatible across DSH versions

**Workaround**:
- Use the `/approval-mode` command to quickly switch modes after restart
- Or use the Web UI selector to change modes

### UI State Synchronization

The Web UI state is managed independently and syncs from the server on refresh:

- ✅ **UI updates immediately** when using the Web UI selector
- ✅ **UI syncs from server** on browser refresh
- ⚠️ **UI does not auto-update** when using the `/approval-mode` command
- ⚠️ **UI shows stale value** if you switch modes via command (until refresh)

**Workaround**:
- Refresh the web page to sync the UI with the actual mode
- Or simply use the Web UI selector instead of the command

**Why this limitation?**
- The UI manages its own state via React `useState` (in-memory approach)
- Commands execute on the server, but don't emit events (to avoid compatibility issues)
- Without events, there's no mechanism to notify the UI of changes
- This is a **fundamental trade-off**: either use events (but sessions won't load), or use memory (but UI won't sync)
- We chose memory storage to ensure sessions load successfully

**Future improvement**:
- Waiting for DSH upstream to provide official support for custom event types
- Or provide a mechanism for plugins to emit ignorable events
- Once supported, this plugin can migrate to event-driven approach and achieve full UI synchronization

For technical details, see [`docs/2026-08-20-plugin-event-compatibility-issue.md`](docs/lessons-learned/2026-08-20-plugin-event-compatibility-issue.md).

### DSH Version Compatibility

**v0.3.0+ requires DSH ≥ 0.1.2-alpha.3**:

The plugin v0.3.0 was migrated to the DSH 0.1.2-alpha.3 API surface and no longer works on earlier DSH lines:

- Removed/relocated exports in `@deepseek-ai/dsh-sandbox-policy` (`effectiveSandboxMode`), `@deepseek-ai/dsh-settings` (`installSettingsSection`, `settingsNamespace`), and the client packages (`@deepseek-ai/dsh-client-runtime` → `dsh-client-modules`)
- Peer dependencies raised from `>=0.1.0-rc.8` to `>=0.1.2-rc.1` for sixteen `@deepseek-ai/dsh-*` packages (the floor moved to `rc.1` in v0.3.2; see below)

If your harness still resolves to an older DSH release, stay on plugin `v0.2.0` and bump only when the harness itself moves to `0.1.2-alpha.3` or later.

**v0.3.2+ raises the floor to DSH ≥ 0.1.2-rc.1**:

Starting with v0.3.2 the peer floors move from `>=0.1.2-alpha.3` to `>=0.1.2-rc.1` (the version the harness itself now ships under). No source change is needed: every call site the v0.3.0 migration introduced — `ctx.sandboxPolicy.overrideOf(session)`, `setSandboxMode(session, mode)`, `ctx.settings.installSection(...)`, the `Context` / `SettingsScope` / `SessionId` import paths, and the `dsh-client-modules` boundary — kept the same shape across the upstream `alpha.4`, `alpha.5`, and `rc.1` releases. The only DSP-side breaking refactor in that range (`refactor(session)!: distinguish event seqs from log offsets`) only added brand separation between `SessionSeq` and `SessionLogOffset`; the plugin reads `session.events` as an array and never touches the numbered fields, so the new brand types do not affect any call site.

If your harness still resolves to `0.1.2-alpha.3` through `0.1.2-alpha.5`, stay on plugin `v0.3.1`.

**DSH 0.1.0-rc.7 API Breaking Change**:

DSH introduced a breaking change to the `ctx.remote.commands.execute()` API in version `0.1.0-rc.7`:

- **Old version** (≤0.1.0-rc.6): `execute(sessionId, line)` - 2 parameters
- **New version** (≥0.1.0-rc.7): `execute(sessionId, line, images)` - 3 parameters, added `images` array

**Impact**:
- ✅ This plugin has been adapted to the new API (v0.1.2+)
- ⚠️ Old plugin versions (≤0.1.1) do not work on DSH 0.1.0-rc.7+
- ⚠️ TypeScript type definitions are inconsistent with the actual API (claims third parameter is `AbortSignal`, but it's actually `images` array)

**Technical Details**:
- The third parameter `images` supports multimodal commands (user-uploaded images)
- For text-only commands (like `/approval-mode`), pass an empty array `[]`
- This plugin uses type assertions to bypass incorrect TypeScript type checking

See [`local-docs/lessons-learned/2026-08-20-commands-api-change.md`](local-docs/lessons-learned/2026-08-20-commands-api-change.md) for details.

## Usage

### Using the Web UI Mode Selector

The plugin provides a visual mode selector in DSH Web (displayed as a small button/chip under the input box):

**Location**: In the toolbar below the chat input box, you'll see a button showing the current mode (e.g., "Approval: Off")

This is the easiest way to switch modes, recommended for daily use.

### Switch Approval Mode via Command

Use the `/approval-mode` command in the DSH Web GUI:

```
/approval-mode              # Show current mode
/approval-mode request      # Switch to request mode
/approval-mode auto-edit    # Switch to auto-edit mode
/approval-mode yolo         # Switch to yolo mode
/approval-mode off          # Disable (restore default)
```

### Example Workflow

```
# Start with maximum security
/approval-mode request

# Let the agent read files (auto-approved)
# Agent tries to edit a file → Approval dialog appears

# Switch to auto-edit for faster development
/approval-mode auto-edit

# Agent edits files automatically
# Agent runs bash command → Approval dialog appears

# Switch to yolo for full automation
/approval-mode yolo

# All tools execute without approval
```

## Known Limitations

### Composer Tool Row Layout

The approval mode chip is registered in the `conversation.input.left` slot of the
composer tool row, beside the access-mode (permission) chip. When plan mode is
active (`/plan`), the platform renders its orange plan-status chip in the
`conversation.input.plan` seat — a named single-occupant seat the harness places
immediately right of the access-mode control — so the plan chip appears between
the permission chip and the approval chip.

This order is fixed by the platform layout: `ui-conversation`'s `InputBar`
renders `conversation.input.plan` inside its "modes" cluster, before the
`conversation.input.left` entries. A plugin cannot move the plan seat without
re-rendering the entire plan control, and relocating it would require a
platform-level change to `ui-conversation`, which this plugin deliberately
avoids. Accepted as-is.

## Customizing the Approval Prompt Text

The dialog shown when a tool requires approval uses the `askReason` template.
Override it in your `cordis.yml` to localize or rewrite the prompt — for
example, switch it to Chinese, swap wording, or add your own guidance:

```yaml
- insert:
    - id: dsh-user-approval-mode
      name: dsh-user-approval-mode
      config:
        askReason: '⚠️ 工具 {tool} 需要您的批准\n当前模式：{mode} | 工具类型：{family}\n只读浏览应使用 read/glob/list_directory 而非 shell'
```

Available placeholders: `{tool}` (tool name), `{mode}` (current approval
mode), `{family}` (edit | shell | readonly | other).

**Why this is a manual step**: the text is generated on the server and sent
to the upstream DSH approval dialog. The plugin has no locale signal at that
point (the language setting lives on the client), so the simplest and most
predictable model is: deployers who need a non-English prompt set it
directly. The mode selector chip on the composer toolbar is independently
localized via DSH's locale service (`src/client/locales.ts`), so the chip
labels already follow the UI language automatically — `askReason` is the one
piece that needs manual configuration.

**Inline color or markup inside `askReason` is not supported**: the upstream
approval dialog renders the reason as a plain string with no markup channel,
so styling or coloring parts of the template has no effect.

## Settings Page

Open the Web UI sidebar → **Settings** → **Approval Modes** (last item, after
Plugins) to edit the six user-facing Config fields. The page header has a
short title and an intro paragraph; the page body is divided into three
sub-sections:

1. **Tool family classification** — one comma-separated text input per
   family (`editTools`, `shellTools`, `readOnlyTools`, `autoAllowTools`).
   The values are treated as sets: order is irrelevant, duplicates are
   folded on commit.
2. **Sandbox policy** — one dropdown per mode (`request`, `auto-edit`,
   `yolo`). Dropdown labels display in English in both `en` and `zh`
   locales (the values are technical identifiers shared with the schema).
3. **Approval prompt** — multi-line `askReason` template

The two remaining Config fields — `default` and `unclassified` — are
deliberately **deployer-only**: they live in `cordis.yml` entry config and
are not exposed in the settings page. The runtime falls back to the cordis
`base` for them.

Each field is rendered in the DSH settings-panel design language: the
label sits on a row with a small text **Reset** on the right, the control
below it, and a muted hint paragraph below that. Consecutive fields are
separated by a 1px hairline (no card chrome). All colours resolve through
`--dsw-alias-*` semantic tokens, so the page renders correctly in light
and dark themes.

- A text **Reset** on the right of the label row clears the user override
  for that field; the value falls back to whatever the deployer set in
  `cordis.yml` (the composition `base` layer).
- The hint paragraph below each control is sourced from the schemastery
  field description.
- Locale-aware labels and descriptions (`en` and `zh` shipped; add more by
  extending `src/client/locales.ts`).

### Layering model

The settings namespace `approval-mode` resolves a value through three
layers:

```
schema defaults  →  cordis `base` (deployer's cordis.yml)  →  user override
```

When the user has not touched a field, the value is the deployer's cordis
config. When the user has edited a field, their value wins. Reset clears
the user override (so the deployer's base re-emerges).

### What the user can edit

| Field | Type | Notes |
|-------|------|-------|
| `editTools` | comma-separated text (set) | Auto-approved under auto-edit |
| `shellTools` | comma-separated text (set) | Always require approval under request and auto-edit |
| `readOnlyTools` | comma-separated text (set) | Always allowed (any mode) |
| `autoAllowTools` | comma-separated text (set) | Bypass approval regardless of family |
| `sandboxDefaults` | per-mode dropdown | Sandbox policy when switching into each mode |
| `askReason` | textarea | Approval dialog template (placeholders: `{tool}` / `{mode}` / `{family}`) |

Deployer-only (not shown in the page; set in `cordis.yml`):

- `default` — mode assigned to new sessions
- `unclassified` — `'ask'` / `'allow'` strategy for tools not in any family

### Effect timing

The six user-editable fields are **live** — they take effect on the next
`tools/pre-execute` invocation, no DSH restart required. The runtime gate
re-reads the settings scope on every tool call.

### Overlap between family lists

`editTools`, `shellTools`, and `readOnlyTools` should be **mutually
exclusive** — a tool name should appear in at most one family list. The
UI shows a hint reminding you of this; if you accidentally put a tool in
two lists anyway, the runtime resolves it deterministically (priority:
`edit > shell > readonly`). `autoAllowTools` is exempt from this rule:
it is checked first, so overlap with any family list is harmless
(redundant, not conflicting).

## Configuration

### Basic Usage (with all defaults)

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval-mode
```

This uses default values:
- `default`: `off` (plugin disabled by default)
- `editTools`: `['write', 'edit', 'str_replace_editor']`
- `shellTools`: `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']`
- `readOnlyTools`: `['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write']`
- `autoAllowTools`: `['ask_user_question', 'exit_plan_mode']`
- `unclassified`: `ask`

### Custom Configuration

You can customize the plugin behavior in your agent preset:

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval-mode
      config:
        # Default mode for new sessions
        default: auto-edit
        
        # Custom tool classifications
        editTools: ['write', 'edit', 'str_replace_editor']
        shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh']
        readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write']
        autoAllowTools: ['ask_user_question', 'exit_plan_mode']
        
        # Strategy for unclassified tools: 'ask' (safer) or 'allow' (faster)
        unclassified: ask
        
        # Sandbox policy for each mode
        sandboxDefaults:
          request: workspace-write
          auto-edit: workspace-write
          yolo: workspace-write
        
        # Custom approval reason message
        askReason: 'approval needed for {tool} under {mode} mode ({family})'
```

### Disable the Plugin

```yaml
- id: approval-modes
  disabled: true
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default` | string | `off` | Default approval mode for new sessions. Options: `request`, `auto-edit`, `yolo`, `off` |
| `editTools` | string[] | `['write', 'edit', 'str_replace_editor']` | Tools classified as "edit" family (file modifications) |
| `shellTools` | string[] | `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']` | Tools classified as "shell" family (command execution) |
| `readOnlyTools` | string[] | `['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write']` | Tools classified as "readonly" family (always allowed) |
| `autoAllowTools` | string[] | `['ask_user_question', 'exit_plan_mode']` | Tools that always bypass approval |
| `unclassified` | string | `ask` | Strategy for unclassified tools: `ask` (require approval) or `allow` (auto-approve) |
| `sandboxDefaults` | object | `{request: 'workspace-write', auto-edit: 'workspace-write', yolo: 'workspace-write'}` | Sandbox mode for each approval mode |
| `askReason` | string | *see default* | Custom message template for approval requests. Supports `{tool}`, `{mode}`, `{family}` placeholders |

### Default Ask Reason

```
approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_directory instead of shell
```

## Tool Family Classification

The plugin automatically classifies tools into four families:

| Family | Default Tools | Behavior |
|--------|--------------|----------|
| **Edit** | `write`, `edit`, `str_replace_editor` | File modification tools |
| **Shell** | `bash`, `pwsh`, `tool:bash`, `tool:pwsh` | Command execution tools |
| **Read-Only** | `read`, `glob`, `grep`, `read_image`, `list_directory`, `todo_write` | Safe browsing tools (always allowed) |
| **Other** | *all other tools* | Unclassified tools, behavior depends on `unclassified` config |

## How It Works

1. **Tool Execution Interception**: The plugin listens to `tools/pre-execute` events
2. **Family Classification**: Determines which family the tool belongs to
3. **Mode Check**: Evaluates current approval mode
4. **Decision**: Returns `{ kind: 'ask' }` for tools requiring approval, or allows execution
5. **Sandbox Sync**: Automatically adjusts sandbox policy when switching modes
6. **State Storage**: Approval mode stored in-memory (WeakMap), resets on DSH restart
7. **UI Synchronization**: Web UI chip manages state via React, syncs from server on refresh

## Dependencies

- `@deepseek-ai/cordis`: Plugin framework
- `@deepseek-ai/dsh-tools`: Tool definition utilities
- `@deepseek-ai/dsh-sandbox`: Sandbox mode types
- `@deepseek-ai/dsh-sandbox-policy`: Sandbox policy management
- `@deepseek-ai/dsh-session`: Session management
- `@deepseek-ai/dsh-settings`: Settings integration
- `@deepseek-ai/dsh-commands`: Command registration
- `@deepseek-ai/dsh-session-projection`: Session projection for UI
- `@deepseek-ai/dsh-api-remotes`: Client RPC
- `@deepseek-ai/dsh-client-runtime`: Client context and runtime services
- `@deepseek-ai/dsh-client-locale`: Locale registry
- `@deepseek-ai/dsh-client-ui-conversation`: Composer slot (`conversation.input.left`)
- `@deepseek-ai/dsh-client-ui-settings`: Settings slot (`settings.section`) + scope service
- `@deepseek-ai/dsh-client-ui-primitives`: Button / Input / Menu primitives
- `@deepseek-ai/dsh-client-ui-slots`: Slot registry
- `@deepseek-ai/schemastery`: Configuration schema validation
- `react`: UI rendering
- `dsh-tool-list-dir`: Recommended read-only directory browsing tool

## Related Projects

- [dsh-tool-list-dir](https://github.com/R-LEI2536/dsh-tool-list-dir) - Read-only directory listing tool, recommended for use with this plugin

## License

MIT

/**
 * ApprovalModeSettings: the settings.section page for editing the ten
 * user-facing Config fields. Bound to the plugin entry's volatile Config via
 * the injected configuration form; reads via `form.getSnapshot()`, writes via
 * `form.set()` (merge into the profile user layer) or `form.unset(field)`
 * (clear user override, re-inherit the deployer's cordis base).
 *
 * Visual layout follows the DSH settings-panel design language (see
 * ui-settings-models / ui-settings-plugins for the canonical reference):
 * page title + intro at the top, sub-sections below, each field a
 * vertical block (label row with a text Reset on the right, control,
 * hint) separated from its neighbours by a 1px hairline.
 *
 * The smart-classifier provider/model/effort rows are dropdowns fed by the
 * live Host model directory (see model-directory.ts) rather than free-text
 * inputs, so a configured route is always one the Host actually advertises.
 *
 * Note: the other 8 Config fields are part of the schema but are
 * deliberately deployer-only — they live in `cordis.yml`, not here.
 */
import { useState, useEffect, useSyncExternalStore, useRef, type ReactElement } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, Switch, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
// DSH 0.1.7: `SettingsScope` 已改名为 `ConfigForm`（dsh-client-ui-settings 的客户端子路径）。
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Config } from '../index'
import type { ApprovalPageKey } from './locales'
import type { SmartCatalogGroup, SmartModelDirectoryFace } from './model-directory'
import { formatToolList, parseToolList, sameToolList } from './tool-list'
import css from './ApprovalModeSettings.module.css'

// ─── Slot contract types ────────────────────────────────────────────────────

/** Injected business face from the client plugin. */
export interface ApprovalModeSettingsInjected {
  /** Live configuration form for the profile entry's volatile Config. */
  form: ConfigForm<Config>
  /** Live Host model directory backing the smart-classifier pickers. */
  directory: SmartModelDirectoryFace
}

/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeSettingsProps =
  PropsRuntime<'settings.section'>
  & InjectFace<ApprovalModeSettingsInjected>
  & { t: (key: ApprovalPageKey) => string }

// ─── Defaults (mirror src/index.ts' schema; used when the value is undefined).
// The server-side copy is pinned by test/tool-family-defaults.test.ts — keep
// this one in step with it when either side changes. ───────────────────────

const FALLBACK: Required<Config> = {
  default: 'off',
  editTools: ['write', 'edit', 'str_replace_editor', 'update_goal'],
  shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh'],
  readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'list_subagent_models', 'schedule_list', 'schedule_view', 'working_directory', 'list_agents', 'job_list', 'get_goal'],
  autoAllowTools: ['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'subagent_fork', 'present', 'wait_agent', 'send_message', 'job_kill', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update', 'run_code', 'mnemon_document_create', 'mnemon_document_manage', 'mnemon_document_search', 'mnemon_forget', 'mnemon_link', 'mnemon_memory_bodies', 'mnemon_memory_body_create', 'mnemon_memory_body_merge', 'mnemon_memory_body_update', 'mnemon_recall', 'mnemon_related', 'mnemon_remember', 'mnemon_runtime_memory', 'mnemon_status', 'mnemon_subagent_result', 'mnemon_view_action', 'mnemon_view_route'],
  unclassified: 'ask',
  readOnlyGitCommands: true,
  sandboxDefaults: { request: 'workspace-write', 'auto-edit': 'workspace-write', smart: 'workspace-write', yolo: 'workspace-write' },
  askReason: '[{family}] Tool: {tool} | Mode: {mode}',
  smartProvider: null,
  smartModel: null,
  smartReasoningEffort: null,
  smartExtraDangerPatterns: [],
  smartDangerPatterns: null,
  smartSessionMemory: true,
  smartSessionMemoryTtlMs: 1_800_000,
  smartTimeoutMs: 15_000,
  smartClassifierPrompt: '',
}

/** Normalize a partial Config (TS view) into a fully-populated one. */
function readValue(snapshotValue: Config | undefined): Required<Config> {
  const c = snapshotValue ?? {}
  return {
    default: c.default ?? FALLBACK.default,
    editTools: c.editTools ?? FALLBACK.editTools,
    shellTools: c.shellTools ?? FALLBACK.shellTools,
    readOnlyTools: c.readOnlyTools ?? FALLBACK.readOnlyTools,
    autoAllowTools: c.autoAllowTools ?? FALLBACK.autoAllowTools,
    unclassified: c.unclassified ?? FALLBACK.unclassified,
    readOnlyGitCommands: c.readOnlyGitCommands ?? FALLBACK.readOnlyGitCommands,
    sandboxDefaults: c.sandboxDefaults ?? FALLBACK.sandboxDefaults,
    askReason: c.askReason ?? FALLBACK.askReason,
    smartProvider: c.smartProvider ?? FALLBACK.smartProvider,
    smartModel: c.smartModel ?? FALLBACK.smartModel,
    smartReasoningEffort: c.smartReasoningEffort ?? FALLBACK.smartReasoningEffort,
    smartExtraDangerPatterns: c.smartExtraDangerPatterns ?? FALLBACK.smartExtraDangerPatterns,
    smartDangerPatterns: c.smartDangerPatterns ?? FALLBACK.smartDangerPatterns,
    smartSessionMemory: c.smartSessionMemory ?? FALLBACK.smartSessionMemory,
    smartSessionMemoryTtlMs: c.smartSessionMemoryTtlMs ?? FALLBACK.smartSessionMemoryTtlMs,
    smartTimeoutMs: c.smartTimeoutMs ?? FALLBACK.smartTimeoutMs,
    smartClassifierPrompt: c.smartClassifierPrompt ?? FALLBACK.smartClassifierPrompt,
  }
}

// ─── Field renderers ────────────────────────────────────────────────────────

interface FieldShellProps {
  label: string
  descKey: ApprovalPageKey
  t: (key: ApprovalPageKey) => string
  onReset: () => void
  resetLabel: string
  children: ReactElement
}

/** One settings row in the DSH settings-panel design language: label + a
 *  text Reset on the right of the same row, then the control, then the
 *  description as a muted hint. The container draws a 1px hairline on top
 *  so consecutive rows read as a list, not as a stack of cards. */
function FieldShell({ label, descKey, t, onReset, resetLabel, children }: FieldShellProps) {
  const description = t(descKey)
  return (
    <div className={css.field}>
      <div className={css.head}>
        <span className={css.label}>{label}</span>
        <button type="button" className={css.reset} onClick={onReset}>
          {resetLabel}
        </button>
      </div>
      <div className={css.control}>{children}</div>
      <p className={css.hint}>{description}</p>
    </div>
  )
}

interface EnumDropdownProps<T extends string> {
  value: T
  items: readonly { id: T; label: string }[]
  /** Short label for the trigger; menu rows use each item's own label. */
  resolveLabel: (id: T) => string
  onChange: (next: T) => void
  /** Disables the trigger; used while a dependent list is unavailable. */
  disabled?: boolean
  /** Called when the menu opens, e.g. to lazily load its options. */
  onOpen?: () => void
}

/** Anchored Menu used as a single-select dropdown. */
function EnumDropdown<T extends string>({ value, items, resolveLabel, onChange, disabled, onOpen }: EnumDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  // A control can be disabled while its menu is open (a commit in flight, or a
  // dependent list going away); close it so re-enabling does not pop it open.
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  const triggerLabel = resolveLabel(value)
  return (
    <Menu
      open={open && !disabled}
      anchor={(
        <button
          ref={anchorRef}
          type="button"
          className={`${css.dropdownTrigger} ${open && !disabled ? css.open : ''}`}
          disabled={disabled}
          title={triggerLabel}
          onClick={() => {
            if (disabled) return
            if (!open) onOpen?.()
            setOpen(!open)
          }}
        >
          <span className={css.dropdownValue}>{triggerLabel}</span>
          <IconChevronDownOutlineRegular size={14} className={css.dropdownChevron} />
        </button>
      )}
      // The menu may be wider than the trigger, so each row keeps its own
      // label: the inherited entry names the current default, and a stored
      // value that the catalogue no longer advertises is marked as such.
      items={items.map(item => ({ id: item.id, label: item.label }))}
      selectedId={value}
      onSelect={(id) => {
        setOpen(false)
        onChange(id as T)
      }}
      onClose={() => { setOpen(false) }}
      side="bottom"
      align="start"
    />
  )
}

interface CsvInputProps {
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
  disabled?: boolean
}

/** Editable string[] as a comma-separated textarea. Treats the value as a set:
 *  on commit, splits on commas (or newlines, so a pasted list parses), trims
 *  each token, drops empties, and deduplicates (first occurrence wins).
 *
 *  Commit happens on blur or Enter, NOT on every keystroke. Live committing
 *  would round-trip through the settings form on each character; the
 *  dedup/trim pass can change the string shape, which would reset the
 *  controlled value and snap the caret to the end mid-typing. Holding the
 *  parsed result until commit keeps the cursor stable while the user edits. A
 *  commit whose parsed result equals the current value sends no write at all.
 *
 *  The box is a textarea rather than an input so that a long tool list wraps
 *  instead of scrolling sideways. Its height is pure CSS (`field-sizing:
 *  content` under a max-height cap — see `.listInput`), so no measuring
 *  effect is needed. */
function CsvInput({ value, onChange, placeholder, disabled }: CsvInputProps) {
  // Local copy mirrors the value; resyncs only when the prop changes (e.g.,
  // an external reset or form update overrides the in-progress edit).
  const [text, setText] = useState(formatToolList(value))
  useEffect(() => { setText(formatToolList(value)) }, [value])

  const commit = (next: string): void => {
    const parts = parseToolList(next)
    if (!sameToolList(parts, value)) onChange(parts)
  }

  return (
    <textarea
      rows={1}
      value={text}
      placeholder={placeholder}
      className={css.listInput}
      disabled={disabled}
      onChange={(e) => { setText(e.target.value) }}
      onBlur={(e) => { commit(e.target.value) }}
      onKeyDown={(e) => {
        // A list value holds no newlines, so Enter commits instead of breaking
        // the line. Never intercept while an IME is composing.
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
        e.preventDefault()
        commit(text)
      }}
    />
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ApprovalModeSettings({ form, directory, t }: ApprovalModeSettingsProps) {
  // useSyncExternalStore on the form; getSnapshot returns a stable reference
  // until the next commit, so React bails out of unnecessary re-renders.
  const snapshot = useSyncExternalStore(
    (cb) => form.subscribe(cb),
    () => form.getSnapshot(),
  )
  const value = readValue(snapshot.value)

  // Write-in-flight guard and refused-write alert (official DeveloperToolsRow
  // pattern): busy disables the control being committed, saveFailed renders an
  // inline alert so a rejected write never vanishes silently.
  const [busy, setBusy] = useState<ReadonlySet<keyof Config>>(new Set())
  const [saveFailed, setSaveFailed] = useState(false)

  // Always-visible reset: clears the user override for this top-level field,
  // letting it re-inherit the cordis `base`. No confirm — reset is reversible.
  const resetField = async (field: keyof Config): Promise<void> => {
    setSaveFailed(false)
    if (!await form.unset(field)) setSaveFailed(true)
  }
  const reset = (field: keyof Config): void => { void resetField(field) }

  // Official settings-page pattern (cf. DeveloperToolsRow): a commit disables
  // the controls being written while in flight, and a refused write surfaces an
  // alert instead of silently reverting — the recovery re-read would otherwise
  // erase the field on screen without the user knowing why. No auto-retry:
  // re-applying could clobber a concurrent edit.
  //
  // Takes a list because the smart-classifier pickers commit as a group
  // (provider → model → effort): one write per changed field, in order, and
  // the first refusal stops the run and reports it.
  const commitFields = async (entries: readonly (readonly [keyof Config, unknown])[]): Promise<void> => {
    if (entries.length === 0) return
    setSaveFailed(false)
    const fields = entries.map(([field]) => field)
    setBusy((prev) => { const next = new Set(prev); for (const field of fields) next.add(field); return next })
    try {
      for (const [field, next] of entries) {
        if (!await form.set(field, next)) { setSaveFailed(true); return }
      }
    } finally {
      setBusy((prev) => { const rest = new Set(prev); for (const field of fields) rest.delete(field); return rest })
    }
  }
  const commitField = (field: keyof Config, next: unknown): Promise<void> => commitFields([[field, next]])

  // SandboxDefaults is a single field; each mode row edits a sub-key.
  const setSandboxMode = (mode: 'request' | 'auto-edit' | 'smart' | 'yolo', sandboxMode: string): void => {
    void commitField('sandboxDefaults', { ...value.sandboxDefaults, [mode]: sandboxMode })
  }

  // askReason is a free-form textarea. Live committing on every keystroke
  // round-trips through the settings form and snaps the caret to the end
  // mid-typing; hold the typed text in local state and commit on blur so
  // the caret stays where the user put it.
  const [askReasonText, setAskReasonText] = useState(value.askReason)
  useEffect(() => { setAskReasonText(value.askReason) }, [value.askReason])
  const commitAskReason = (next: string): void => {
    if (next !== value.askReason) { void commitField('askReason', next) }
  }

  // ── Smart classifier pickers ──────────────────────────────────────────────
  // The catalogue is a Host fact, not a settings value (see model-directory.ts):
  // it loads on the first render of this page, reloads when adapters or model
  // listings change, and drops on reconnect. `ensure()` only acts while idle,
  // so this effect costs one call per page visit and never retries in a loop.
  const catalog = useSyncExternalStore(
    (cb) => directory.subscribe(cb),
    () => directory.getSnapshot(),
  )
  useEffect(() => { directory.ensure() }, [directory, catalog.status])

  const catalogReady = catalog.status === 'ready'
  const providerGroup: SmartCatalogGroup | undefined = value.smartProvider === null
    ? undefined
    : catalog.groups.find(group => group.id === value.smartProvider)
  const selectedModel = providerGroup?.models.find(entry => entry.id === value.smartModel)
  const efforts = selectedModel?.reasoning?.efforts ?? []

  // Trigger labels stay short; menu rows carry the longer explanation, since
  // the menu is wider than the trigger pill.
  const inheritLabel = t('smartClassifier.inherit')
  const inheritMenuLabel = catalog.defaultProvider === undefined || catalog.defaultModel === undefined
    ? inheritLabel
    : `${inheritLabel} · ${t('smartClassifier.hostDefaultLabel')}: ${catalog.defaultProvider} / ${catalog.defaultModel}`

  const providerItems: { id: string; label: string }[] = [
    { id: '', label: inheritMenuLabel },
    ...catalog.groups.map(group => ({ id: group.id, label: group.name })),
  ]
  // A stored provider the Host no longer advertises stays visible so the
  // configured value is never silently rewritten to look like something else.
  if (value.smartProvider !== null && catalogReady && providerGroup === undefined) {
    providerItems.push({ id: value.smartProvider, label: `${value.smartProvider} · ${t('smartClassifier.outOfCatalog')}` })
  }

  const modelItems: { id: string; label: string }[] = (providerGroup?.models ?? [])
    .map(entry => ({ id: entry.id, label: entry.name }))
  if (value.smartModel !== null && catalogReady && !modelItems.some(item => item.id === value.smartModel)) {
    modelItems.unshift({ id: value.smartModel, label: `${value.smartModel} · ${t('smartClassifier.outOfCatalog')}` })
  }

  const effortItems: { id: string; label: string }[] = [
    { id: '', label: t('smartClassifier.modelDefault') },
    ...efforts.map(effort => ({ id: effort.id, label: effort.name })),
  ]
  if (value.smartReasoningEffort !== null && catalogReady && !effortItems.some(item => item.id === value.smartReasoningEffort)) {
    effortItems.push({ id: value.smartReasoningEffort, label: `${value.smartReasoningEffort} · ${t('smartClassifier.outOfCatalog')}` })
  }

  // Commit the three related fields as one group, writing only what changed.
  const commitSmartSelection = (next: { provider?: string | null; model?: string | null; effort?: string | null }): void => {
    const entries: (readonly [keyof Config, unknown])[] = []
    if (next.provider !== undefined && next.provider !== value.smartProvider) entries.push(['smartProvider', next.provider])
    if (next.model !== undefined && next.model !== value.smartModel) entries.push(['smartModel', next.model])
    if (next.effort !== undefined && next.effort !== value.smartReasoningEffort) entries.push(['smartReasoningEffort', next.effort])
    void commitFields(entries)
  }

  /** Effort ids a model advertises inside one provider group. */
  const effortIdsIn = (group: SmartCatalogGroup | undefined, model: string | null): ReadonlySet<string> => new Set(
    (model === null ? [] : group?.models.find(entry => entry.id === model)?.reasoning?.efforts ?? [])
      .map(effort => effort.id),
  )

  // Provider and model are coupled: "inherit" is all-or-nothing, so picking a
  // concrete provider selects a model it actually advertises, and picking
  // "inherit" clears all three. An effort survives only while the same model
  // remains selected and still advertises it.
  const changeProvider = (next: string): void => {
    if (next === '') {
      commitSmartSelection({ provider: null, model: null, effort: null })
      return
    }
    const group = catalog.groups.find(entry => entry.id === next)
    const keepsModel = value.smartModel !== null && group?.models.some(entry => entry.id === value.smartModel) === true
    const model = keepsModel ? value.smartModel : group?.models[0]?.id ?? null
    const keepsEffort = keepsModel && value.smartReasoningEffort !== null
      && effortIdsIn(group, model).has(value.smartReasoningEffort)
    commitSmartSelection({ provider: next, model, effort: keepsEffort ? value.smartReasoningEffort : null })
  }

  const changeModel = (next: string): void => {
    const keepsEffort = value.smartReasoningEffort !== null && effortIdsIn(providerGroup, next).has(value.smartReasoningEffort)
    commitSmartSelection({ model: next, effort: keepsEffort ? value.smartReasoningEffort : null })
  }

  const changeEffort = (next: string): void => {
    commitSmartSelection({ effort: next === '' ? null : next })
  }

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav.label')}</h2>
      <p className={css.intro}>{t('intro')}</p>
      {saveFailed && (
        <p className={css.saveError} role="alert">{t('save.conflict')}</p>
      )}

      {/* ── Tool family classification ────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.tools')}</h3>
        <div className={css.subSectionBody}>
          <FieldShell
            label={t('field.editTools')}
            descKey="desc.editTools"
            t={t}
            onReset={() => { reset('editTools') }}
            resetLabel={t('reset.label')}
          >
            <CsvInput
              value={value.editTools}
              disabled={busy.has('editTools')}
              onChange={(v) => { void commitField('editTools', v) }}
              placeholder={t('csv.placeholder')}
            />
          </FieldShell>

          <FieldShell
            label={t('field.shellTools')}
            descKey="desc.shellTools"
            t={t}
            onReset={() => { reset('shellTools') }}
            resetLabel={t('reset.label')}
          >
            <CsvInput
              value={value.shellTools}
              disabled={busy.has('shellTools')}
              onChange={(v) => { void commitField('shellTools', v) }}
              placeholder={t('csv.placeholder')}
            />
          </FieldShell>

          <FieldShell
            label={t('field.readOnlyTools')}
            descKey="desc.readOnlyTools"
            t={t}
            onReset={() => { reset('readOnlyTools') }}
            resetLabel={t('reset.label')}
          >
            <CsvInput
              value={value.readOnlyTools}
              disabled={busy.has('readOnlyTools')}
              onChange={(v) => { void commitField('readOnlyTools', v) }}
              placeholder={t('csv.placeholder')}
            />
          </FieldShell>

          <FieldShell
            label={t('field.autoAllowTools')}
            descKey="desc.autoAllowTools"
            t={t}
            onReset={() => { reset('autoAllowTools') }}
            resetLabel={t('reset.label')}
          >
            <CsvInput
              value={value.autoAllowTools}
              disabled={busy.has('autoAllowTools')}
              onChange={(v) => { void commitField('autoAllowTools', v) }}
              placeholder={t('csv.placeholder')}
            />
          </FieldShell>

          <FieldShell
            label={t('field.readOnlyGitCommands')}
            descKey="desc.readOnlyGitCommands"
            t={t}
            onReset={() => { reset('readOnlyGitCommands') }}
            resetLabel={t('reset.label')}
          >
            <Switch
              checked={value.readOnlyGitCommands}
              disabled={busy.has('readOnlyGitCommands')}
              label={t('field.readOnlyGitCommands')}
              onChange={(next) => { void commitField('readOnlyGitCommands', next) }}
            />
          </FieldShell>
        </div>
      </div>

      {/* ── Sandbox policy ─────────────────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.sandbox')}</h3>
        <div className={css.subSectionBody}>
          <FieldShell
            label={t('field.sandboxRequest')}
            descKey="desc.sandbox"
            t={t}
            onReset={() => { reset('sandboxDefaults') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown<'read-only' | 'workspace-write' | 'danger-full-access'>
              value={value.sandboxDefaults.request ?? 'workspace-write'}
              items={[
                { id: 'read-only', label: t('sandbox.read-only') },
                { id: 'workspace-write', label: t('sandbox.workspace-write') },
                { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
              ]}
              resolveLabel={(id) => t(`sandbox.${id}` as ApprovalPageKey)}
              onChange={(next) => { setSandboxMode('request', next) }}
            />
          </FieldShell>

          <FieldShell
            label={t('field.sandboxAutoEdit')}
            descKey="desc.sandbox"
            t={t}
            onReset={() => { reset('sandboxDefaults') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown<'read-only' | 'workspace-write' | 'danger-full-access'>
              value={value.sandboxDefaults['auto-edit'] ?? 'workspace-write'}
              items={[
                { id: 'read-only', label: t('sandbox.read-only') },
                { id: 'workspace-write', label: t('sandbox.workspace-write') },
                { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
              ]}
              resolveLabel={(id) => t(`sandbox.${id}` as ApprovalPageKey)}
              onChange={(next) => { setSandboxMode('auto-edit', next) }}
            />
          </FieldShell>

          <FieldShell
            label={t('field.smartSandbox')}
            descKey="desc.sandbox"
            t={t}
            onReset={() => { reset('sandboxDefaults') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown<'read-only' | 'workspace-write' | 'danger-full-access'>
              value={value.sandboxDefaults.smart ?? 'workspace-write'}
              items={[
                { id: 'read-only', label: t('sandbox.read-only') },
                { id: 'workspace-write', label: t('sandbox.workspace-write') },
                { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
              ]}
              resolveLabel={(id) => t(`sandbox.${id}` as ApprovalPageKey)}
              onChange={(next) => { setSandboxMode('smart', next) }}
            />
          </FieldShell>

          <FieldShell
            label={t('field.sandboxYolo')}
            descKey="desc.sandbox"
            t={t}
            onReset={() => { reset('sandboxDefaults') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown<'read-only' | 'workspace-write' | 'danger-full-access'>
              value={value.sandboxDefaults.yolo ?? 'workspace-write'}
              items={[
                { id: 'read-only', label: t('sandbox.read-only') },
                { id: 'workspace-write', label: t('sandbox.workspace-write') },
                { id: 'danger-full-access', label: t('sandbox.danger-full-access') },
              ]}
              resolveLabel={(id) => t(`sandbox.${id}` as ApprovalPageKey)}
              onChange={(next) => { setSandboxMode('yolo', next) }}
            />
          </FieldShell>
        </div>
      </div>

      {/* ── Smart classifier ─────────────────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.smartClassifier')}</h3>
        <div className={css.subSectionBody}>
          {(catalog.status === 'loading' || catalog.status === 'error') && (
            <p className={css.catalogStatus} role={catalog.status === 'error' ? 'alert' : undefined}>
              {catalog.status === 'error' ? t('smartClassifier.loadError') : t('smartClassifier.loading')}
              {catalog.status === 'error' && (
                <button type="button" className={css.retry} onClick={() => { directory.refresh() }}>
                  {t('smartClassifier.retry')}
                </button>
              )}
            </p>
          )}
          <FieldShell
            label={t('field.smartProvider')}
            descKey="desc.smartProvider"
            t={t}
            onReset={() => { reset('smartProvider') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown
              value={value.smartProvider ?? ''}
              items={providerItems}
              resolveLabel={(id) => id === '' ? inheritLabel : id}
              disabled={!catalogReady || busy.has('smartProvider')}
              onChange={changeProvider}
            />
          </FieldShell>
          <FieldShell
            label={t('field.smartModel')}
            descKey="desc.smartModel"
            t={t}
            onReset={() => { reset('smartModel') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown
              value={value.smartModel ?? ''}
              items={modelItems}
              resolveLabel={() => value.smartModel ?? t('smartClassifier.modelInherited')}
              disabled={value.smartProvider === null || !catalogReady || busy.has('smartModel')}
              onChange={changeModel}
            />
          </FieldShell>
          <FieldShell
            label={t('field.smartReasoningEffort')}
            descKey="desc.smartReasoningEffort"
            t={t}
            onReset={() => { reset('smartReasoningEffort') }}
            resetLabel={t('reset.label')}
          >
            <EnumDropdown
              value={value.smartReasoningEffort ?? ''}
              items={effortItems}
              resolveLabel={(id) => id === '' ? t('smartClassifier.modelDefault') : id}
              disabled={value.smartModel === null || efforts.length === 0 || busy.has('smartReasoningEffort')}
              onChange={changeEffort}
            />
          </FieldShell>
        </div>
      </div>

      {/* ── Approval prompt ────────────────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.dialog')}</h3>
        <div className={css.subSectionBody}>
          <FieldShell
            label={t('field.askReason')}
            descKey="desc.askReason"
            t={t}
            onReset={() => { reset('askReason') }}
            resetLabel={t('reset.label')}
          >
            <textarea
              value={askReasonText}
              placeholder={t('askReason.placeholder')}
              className={css.textarea}
              disabled={busy.has('askReason')}
              onChange={(e) => { setAskReasonText(e.target.value) }}
              onBlur={(e) => { commitAskReason(e.target.value) }}
            />
          </FieldShell>
        </div>
      </div>
    </div>
  )
}
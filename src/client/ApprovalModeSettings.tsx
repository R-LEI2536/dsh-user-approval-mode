/**
 * ApprovalModeSettings: the settings.section page for editing the eight
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
 * Note: the other 8 Config fields are part of the schema but are
 * deliberately deployer-only — they live in `cordis.yml`, not here.
 */
import { useState, useEffect, useSyncExternalStore, useRef, type ReactElement } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, Input, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
// DSH 0.1.7: `SettingsScope` 已改名为 `ConfigForm`（dsh-client-ui-settings 的客户端子路径）。
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Config } from '../index'
import type { ApprovalPageKey } from './locales'
import { formatToolList, parseToolList, sameToolList } from './tool-list'
import css from './ApprovalModeSettings.module.css'

// ─── Slot contract types ────────────────────────────────────────────────────

/** Injected business face from the client plugin. */
export interface ApprovalModeSettingsInjected {
  /** Live configuration form for the profile entry's volatile Config. */
  form: ConfigForm<Config>
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
  readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'reme_search', 'list_agents', 'job_list', 'get_goal'],
  autoAllowTools: ['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'present', 'wait_agent', 'send_message', 'team_task_update', 'team_task_list'],
  unclassified: 'ask',
  readOnlyGitCommands: true,
  sandboxDefaults: { request: 'workspace-write', 'auto-edit': 'workspace-write', smart: 'workspace-write', yolo: 'workspace-write' },
  askReason: 'approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_directory instead of shell',
  smartProvider: null,
  smartModel: null,
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
  resolveLabel: (id: T) => string
  onChange: (next: T) => void
}

/** Anchored Menu used as a single-select dropdown. */
function EnumDropdown<T extends string>({ value, items, resolveLabel, onChange }: EnumDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  return (
    <Menu
      open={open}
      anchor={(
        <button
          ref={anchorRef}
          type="button"
          className={`${css.dropdownTrigger} ${open ? css.open : ''}`}
          onClick={() => { setOpen(!open) }}
        >
          <span>{resolveLabel(value)}</span>
          <IconChevronDownOutlineRegular size={14} className={css.dropdownChevron} />
        </button>
      )}
      items={items.map(item => ({ id: item.id, label: resolveLabel(item.id) }))}
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

export function ApprovalModeSettings({ form, t }: ApprovalModeSettingsProps) {
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
  // the control while in flight, and a refused write surfaces an alert instead
  // of silently reverting — the recovery re-read would otherwise erase the
  // field on screen without the user knowing why. No auto-retry: re-applying
  // could clobber a concurrent edit.
  const commitField = async (field: keyof Config, next: unknown): Promise<void> => {
    setSaveFailed(false)
    setBusy(prev => new Set(prev).add(field))
    try {
      if (!await form.set(field, next)) setSaveFailed(true)
    } finally {
      setBusy(prev => { const rest = new Set(prev); rest.delete(field); return rest })
    }
  }

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

  // smartProvider/smartModel are single-line inputs. Same live-commit hazard
  // as askReason above: committing on every keystroke round-trips through the
  // settings form and snaps the caret to the end mid-typing (fast typing can
  // even drop characters). Hold each draft locally and commit on blur.
  const [smartProviderText, setSmartProviderText] = useState(value.smartProvider ?? '')
  useEffect(() => { setSmartProviderText(value.smartProvider ?? '') }, [value.smartProvider])
  const commitSmartProvider = (next: string): void => {
    const normalized = next === '' ? null : next
    if (normalized !== value.smartProvider) { void commitField('smartProvider', normalized) }
  }
  const [smartModelText, setSmartModelText] = useState(value.smartModel ?? '')
  useEffect(() => { setSmartModelText(value.smartModel ?? '') }, [value.smartModel])
  const commitSmartModel = (next: string): void => {
    const normalized = next === '' ? null : next
    if (normalized !== value.smartModel) { void commitField('smartModel', normalized) }
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
          <FieldShell
            label={t('field.smartProvider')}
            descKey="desc.smartProvider"
            t={t}
            onReset={() => { reset('smartProvider') }}
            resetLabel={t('reset.label')}
          >
            <Input
              value={smartProviderText}
              placeholder={t('smartClassifier.provider.placeholder')}
              className={css.csvInput}
              disabled={busy.has('smartProvider')}
              onChange={(e) => { setSmartProviderText(e.target.value) }}
              onBlur={(e) => { commitSmartProvider(e.target.value) }}
            />
          </FieldShell>
          <FieldShell
            label={t('field.smartModel')}
            descKey="desc.smartModel"
            t={t}
            onReset={() => { reset('smartModel') }}
            resetLabel={t('reset.label')}
          >
            <Input
              value={smartModelText}
              placeholder={t('smartClassifier.model.placeholder')}
              className={css.csvInput}
              disabled={busy.has('smartModel')}
              onChange={(e) => { setSmartModelText(e.target.value) }}
              onBlur={(e) => { commitSmartModel(e.target.value) }}
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
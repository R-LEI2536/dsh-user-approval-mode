/**
 * ApprovalModeSettings: the settings.section page for editing the six
 * user-facing Config fields. Bound to the `approval-mode` settings namespace
 * via the injected scope; reads via `scope.getSnapshot()`, writes via
 * `scope.set()` (merge into user layer) or `scope.unset(field)` (clear user
 * override, re-inherit the cordis `base`).
 *
 * Visual layout follows the DSH settings-panel design language (see
 * ui-settings-models / ui-settings-plugins for the canonical reference):
 * page title + intro at the top, sub-sections below, each field a
 * vertical block (label row with a text Reset on the right, control,
 * hint) separated from its neighbours by a 1px hairline.
 *
 * Note: `default` and `unclassified` are part of the Config schema but are
 * deliberately deployer-only — they live in `cordis.yml`, not here.
 */
import { useState, useEffect, useSyncExternalStore, useRef, type ReactElement } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { Config } from '../index'
import type { ApprovalPageKey } from './locales'
import css from './ApprovalModeSettings.module.css'

// ─── Slot contract types ────────────────────────────────────────────────────

/** Injected business face from the client plugin. */
export interface ApprovalModeSettingsInjected {
  /** Live settings scope for the `approval-mode` namespace. */
  scope: SettingsScope<Config>
}

/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeSettingsProps =
  PropsRuntime<'settings.section'>
  & InjectFace<ApprovalModeSettingsInjected>
  & { t: (key: ApprovalPageKey) => string }

// ─── Defaults (mirror src/index.ts; used only when value is undefined) ──────

const FALLBACK: Required<Config> = {
  default: 'off',
  editTools: ['write', 'edit', 'str_replace_editor'],
  shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh'],
  readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write'],
  autoAllowTools: ['ask_user_question', 'exit_plan_mode'],
  unclassified: 'ask',
  sandboxDefaults: { request: 'workspace-write', 'auto-edit': 'workspace-write', yolo: 'workspace-write' },
  askReason: 'approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_directory instead of shell',
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
    sandboxDefaults: c.sandboxDefaults ?? FALLBACK.sandboxDefaults,
    askReason: c.askReason ?? FALLBACK.askReason,
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
          className={css.dropdownTrigger}
          onClick={() => { setOpen(!open) }}
        >
          <span>{resolveLabel(value)}</span>
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
}

/** Editable string[] as a single comma-separated text input. Treats the value
 *  as a set: on commit, splits on comma, trims each token, drops empties,
 *  and deduplicates (first occurrence wins).
 *
 *  Commit happens on blur, NOT on every keystroke. Live committing would
 *  round-trip through the settings scope on each character; the dedup/trim
 *  pass can change the string shape, which would reset the controlled input
 *  value and snap the caret to the end mid-typing. Holding the parsed
 *  result until blur keeps the cursor stable while the user edits. */
function CsvInput({ value, onChange, placeholder }: CsvInputProps) {
  // Local copy mirrors the value; resyncs only when the prop changes (e.g.,
  // an external reset or scope update overrides the in-progress edit).
  const [text, setText] = useState(value.join(', '))
  useEffect(() => { setText(value.join(', ')) }, [value])

  const commit = (next: string): void => {
    const parts = [...new Set(
      next.split(',').map(s => s.trim()).filter(s => s.length > 0),
    )]
    onChange(parts)
  }

  return (
    <Input
      value={text}
      placeholder={placeholder}
      onChange={(e) => { setText(e.target.value) }}
      onBlur={(e) => { commit(e.target.value) }}
    />
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ApprovalModeSettings({ scope, t }: ApprovalModeSettingsProps) {
  // useSyncExternalStore on the scope; getSnapshot returns a stable reference
  // until the next commit, so React bails out of unnecessary re-renders.
  const snapshot = useSyncExternalStore(
    (cb) => scope.subscribe(cb),
    () => scope.getSnapshot(),
  )
  const value = readValue(snapshot.value)

  // Always-visible reset: clears the user override for this top-level field,
  // letting it re-inherit the cordis `base`. No confirm — reset is reversible.
  const reset = (field: keyof Config): void => {
    void scope.unset(field)
  }

  // SandboxDefaults is a single field; each mode row edits a sub-key.
  const setSandboxMode = (mode: 'request' | 'auto-edit' | 'yolo', sandboxMode: string): void => {
    void scope.set('sandboxDefaults', { ...value.sandboxDefaults, [mode]: sandboxMode })
  }

  // askReason is a free-form textarea. Live committing on every keystroke
  // round-trips through the settings scope and snaps the caret to the end
  // mid-typing; hold the typed text in local state and commit on blur so
  // the caret stays where the user put it.
  const [askReasonText, setAskReasonText] = useState(value.askReason)
  useEffect(() => { setAskReasonText(value.askReason) }, [value.askReason])
  const commitAskReason = (next: string): void => {
    if (next !== value.askReason) { void scope.set('askReason', next) }
  }

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('nav.label')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {/* ── Tool family classification ────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.tools')}</h3>

        <FieldShell
          label={t('field.editTools')}
          descKey="desc.editTools"
          t={t}
          onReset={() => { reset('editTools') }}
          resetLabel={t('reset.label')}
        >
          <CsvInput
            value={value.editTools}
            onChange={(v) => { void scope.set('editTools', v) }}
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
            onChange={(v) => { void scope.set('shellTools', v) }}
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
            onChange={(v) => { void scope.set('readOnlyTools', v) }}
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
            onChange={(v) => { void scope.set('autoAllowTools', v) }}
            placeholder={t('csv.placeholder')}
          />
        </FieldShell>
      </div>

      {/* ── Sandbox policy ─────────────────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.sandbox')}</h3>

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

      {/* ── Approval prompt ────────────────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.dialog')}</h3>

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
            onChange={(e) => { setAskReasonText(e.target.value) }}
            onBlur={(e) => { commitAskReason(e.target.value) }}
          />
        </FieldShell>
      </div>
    </div>
  )
}
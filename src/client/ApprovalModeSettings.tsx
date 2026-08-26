/**
 * ApprovalModeSettings: the settings.section page for editing all eight
 * Config fields. Bound to the `approval-mode` settings namespace via the
 * injected scope; reads via `scope.getSnapshot()`, writes via `scope.set()`
 * (merge into user layer) or `scope.unset(field)` (clear user override,
 * re-inherit the cordis `base`).
 *
 * Layout: four sub-sections (Default behavior, Tool family classification,
 * Sandbox policy, Approval prompt). Each top-level field owns a Reset button
 * that's always rendered — reset calls `scope.unset(field)` and the value
 * falls back to the deployer's cordis entry config.
 */
import { useState, useEffect, useSyncExternalStore, useRef, type ReactElement } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, Input, Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { Config, ApprovalMode } from '../index'
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

// ─── ApprovalMode enum labels (for the default dropdown) ────────────────────

const APPROVAL_MODE_ITEMS: readonly { id: ApprovalMode; label: string }[] = [
  { id: 'off', label: 'mode.off' },
  { id: 'request', label: 'mode.request' },
  { id: 'auto-edit', label: 'mode.auto-edit' },
  { id: 'yolo', label: 'mode.yolo' },
]

// ─── Defaults (mirror src/index.ts; used only when value is undefined) ──────

const FALLBACK: Required<Config> = {
  default: 'off',
  editTools: ['write', 'edit', 'str_replace_editor'],
  shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh'],
  readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_dir'],
  autoAllowTools: ['ask_user_question', 'exit_plan_mode'],
  unclassified: 'ask',
  sandboxDefaults: { request: 'workspace-write', 'auto-edit': 'workspace-write', yolo: 'workspace-write' },
  askReason: 'approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_dir instead of shell',
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

/** Label + ? tooltip + control + always-visible Reset button. */
function FieldShell({ label, descKey, t, onReset, resetLabel, children }: FieldShellProps) {
  return (
    <div className={css.field}>
      <div className={css.fieldLabel}>
        <span className={css.fieldLabelText}>{label}</span>
      </div>
      <div className={css.fieldControl}>{children}</div>
      <Tooltip label={t(descKey)} side="right">
        <button type="button" className={css.helpIcon} aria-label="help">?</button>
      </Tooltip>
      <Button variant="ghost" size="sm" className={css.resetButton} onClick={onReset}>
        {resetLabel}
      </Button>
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

interface RowListProps {
  value: string[]
  onChange: (next: string[]) => void
  t: (key: ApprovalPageKey) => string
}

/** Editable string[] as a vertical list of rows + an Add row at the bottom. */
function RowList({ value, onChange, t }: RowListProps) {
  // Local copy mirrors the value; commits back via onChange on each edit.
  const [rows, setRows] = useState<string[]>(value)
  useEffect(() => { setRows(value) }, [value])

  const commit = (next: string[]): void => {
    const trimmed = next.map(s => s.trim()).filter(s => s.length > 0)
    onChange(trimmed)
  }

  const updateRow = (i: number, v: string): void => {
    const next = [...rows]
    next[i] = v
    setRows(next)
    commit(next)
  }

  const removeRow = (i: number): void => {
    const next = rows.filter((_, idx) => idx !== i)
    setRows(next)
    commit(next)
  }

  const addRow = (): void => {
    const next = [...rows, '']
    setRows(next)
    commit(next)
  }

  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className={css.row}>
          <Input
            value={row}
            placeholder={t('row.placeholder')}
            onChange={(e) => { updateRow(i, e.target.value) }}
          />
          <Button variant="ghost" size="sm" onClick={() => { removeRow(i) }}>
            {t('row.remove')}
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className={css.rowAdd} onClick={addRow}>
        {t('row.add')}
      </Button>
      <div className={css.hint}>{t('row.toolsHint')}</div>
    </>
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

  return (
    <div className={css.container}>
      {/* ── Default behavior ──────────────────────────────────────────── */}
      <div className={css.subSection}>
        <h3 className={css.subSectionHeader}>{t('section.default')}</h3>

        <FieldShell
          label={t('field.default')}
          descKey="desc.default"
          t={t}
          onReset={() => { reset('default') }}
          resetLabel={t('reset.label')}
        >
          <EnumDropdown<ApprovalMode>
            value={value.default}
            items={APPROVAL_MODE_ITEMS}
            resolveLabel={(id) => t(`mode.${id}` as ApprovalPageKey)}
            onChange={(next) => { void scope.set('default', next) }}
          />
        </FieldShell>

        <FieldShell
          label={t('field.unclassified')}
          descKey="desc.unclassified"
          t={t}
          onReset={() => { reset('unclassified') }}
          resetLabel={t('reset.label')}
        >
          <EnumDropdown<'ask' | 'allow'>
            value={value.unclassified}
            items={[
              { id: 'ask', label: t('unclassified.ask') },
              { id: 'allow', label: t('unclassified.allow') },
            ]}
            resolveLabel={(id) => id === 'ask' ? t('unclassified.ask') : t('unclassified.allow')}
            onChange={(next) => { void scope.set('unclassified', next) }}
          />
        </FieldShell>
      </div>

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
          <RowList value={value.editTools} onChange={(v) => { void scope.set('editTools', v) }} t={t} />
        </FieldShell>

        <FieldShell
          label={t('field.shellTools')}
          descKey="desc.shellTools"
          t={t}
          onReset={() => { reset('shellTools') }}
          resetLabel={t('reset.label')}
        >
          <RowList value={value.shellTools} onChange={(v) => { void scope.set('shellTools', v) }} t={t} />
        </FieldShell>

        <FieldShell
          label={t('field.readOnlyTools')}
          descKey="desc.readOnlyTools"
          t={t}
          onReset={() => { reset('readOnlyTools') }}
          resetLabel={t('reset.label')}
        >
          <RowList value={value.readOnlyTools} onChange={(v) => { void scope.set('readOnlyTools', v) }} t={t} />
        </FieldShell>

        <FieldShell
          label={t('field.autoAllowTools')}
          descKey="desc.autoAllowTools"
          t={t}
          onReset={() => { reset('autoAllowTools') }}
          resetLabel={t('reset.label')}
        >
          <RowList value={value.autoAllowTools} onChange={(v) => { void scope.set('autoAllowTools', v) }} t={t} />
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
            value={value.askReason}
            placeholder={t('askReason.placeholder')}
            onChange={(e) => { void scope.set('askReason', e.target.value) }}
          />
        </FieldShell>
      </div>
    </div>
  )
}
/**
 * ApprovalModeChip: the composer dock entry for switching approval modes.
 */
import { useState, useEffect } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ApprovalMode } from '../index'
import type { ApprovalKey } from './locales'
import css from './ApprovalModeChip.module.css'

/** Injected business face from the client plugin. */
export interface ApprovalModeChipInjected {
  /** Last-known mode for this session from the client cache, or null on first visit. */
  cachedMode: ApprovalMode | null
  /** Switch to a new approval mode by executing the /approval-mode command. */
  switchMode: (mode: string) => Promise<string | null>
  /** Get the default approval mode from server config. */
  getDefaultMode: () => Promise<string>
}

/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeChipProps =
  PropsRuntime<'conversation.input.left'>
  & InjectFace<ApprovalModeChipInjected>
  & { t: (key: ApprovalKey) => string }

const DEFAULT_MODES: ApprovalMode[] = ['off', 'request', 'auto-edit', 'yolo']

/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function ApprovalModeChip({ cachedMode, switchMode, getDefaultMode, t }: ApprovalModeChipProps) {
  // Sync cache peek: revisit a previously seen session shows the right mode on the
  // very first frame, with no 'off' flicker and no fetch. First-time visit falls
  // back to 'off' until the effect below resolves.
  const [currentMode, setCurrentMode] = useState<ApprovalMode>(() => cachedMode ?? 'off')
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  // One-shot fetch on mount only. The previous `[getDefaultMode]` dep re-fired on
  // every chip re-render (inject factory mints a fresh closure per render),
  // so opening the menu or switching modes issued redundant server queries.
  // Empty deps + cache-hit early return covers the revisit case for free.
  useEffect(() => {
    if (cachedMode) return
    getDefaultMode().then((mode) => {
      setCurrentMode(mode as ApprovalMode)
    }).catch(() => {
      // Keep default 'off' if failed to get mode
    })
  }, [])

  const options = DEFAULT_MODES

  const handleSelect = async (mode: string): Promise<void> => {
    if (mode === currentMode || switching) return
    setOpen(false)
    setSwitching(true)

    try {
      const error = await switchMode(mode)
      if (error === null) {
        setCurrentMode(mode as ApprovalMode)  // UI immediately updates
      } else {
        console.error('Failed to switch approval mode:', error)
      }
    } catch (err) {
      console.error('Exception while switching approval mode:', err)
    } finally {
      setSwitching(false)
    }
  }

  const items = options.map((mode: string) => ({
    id: mode,
    label: t(`mode.${mode}` as ApprovalKey),
  }))

  return (
    <div className={css.container}>
      <Menu
        open={open}
        items={items}
        selectedId={currentMode}
        onSelect={handleSelect}
        onClose={() => { setOpen(false) }}
        side="top"
        anchor={(
          <button
            type="button"
            className={css.trigger}
            disabled={switching}
            aria-label={t('label')}
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => { setOpen(!open) }}
          >
            <span className={css.label}>{t('label')}</span>
            <span className={css.mode}>{t(`mode.${currentMode}` as ApprovalKey)}</span>
            <IconChevronDownOutline14 className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
          </button>
        )}
      />
    </div>
  )
}

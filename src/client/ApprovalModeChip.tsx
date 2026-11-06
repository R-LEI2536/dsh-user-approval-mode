/**
 * ApprovalModeChip: the composer dock entry for switching approval modes.
 *
 * The slot lives in the composer tool row (`conversation.input.left`), which
 * clips overflow. DSH 0.2.2 states the rule on the slot contract itself: fixed
 * overlays in a composer slot must portal to the document body, because the
 * docked composer contains them. The mode menu is a fixed overlay, so it is
 * rendered with `portal` — without it the list can be clipped by the composer.
 */
import { useState, useEffect } from 'react'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { Menu, IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ApprovalMode } from '../index'
import { APPROVAL_MODES } from './mode-text'
import type { ApprovalKey } from './locales'
import css from './ApprovalModeChip.module.css'

/** Injected business face from the client plugin. */
export interface ApprovalModeChipInjected {
  /** Last-known mode for this session from the client cache, or null on first visit. */
  cachedMode: ApprovalMode | null
  /** Switch to a new approval mode by executing the /approval-mode command. */
  switchMode: (mode: string) => Promise<string | null>
  /** Re-read the session's actual mode from the server; null when unavailable or superseded. */
  refreshMode: () => Promise<ApprovalMode | null>
}

/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeChipProps =
  PropsRuntime<'conversation.input.left'>
  & InjectFace<ApprovalModeChipInjected>
  & { t: (key: ApprovalKey) => string }

/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function ApprovalModeChip({ cachedMode, switchMode, refreshMode, t }: ApprovalModeChipProps) {
  // First frame paints the cached mode (no 'off' flicker on revisit); the
  // effect below revalidates against the server and corrects it if stale.
  const [currentMode, setCurrentMode] = useState<ApprovalMode>(() => cachedMode ?? 'off')
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Revalidate on every mount. The cache is only a first-paint hint: a mode
  // changed outside this chip (slash command, another window) must not stay
  // displayed after leaving this session and coming back. Empty deps: the slot
  // re-keys per session, so every revisit remounts the chip; the inject factory
  // mints a fresh closure per render and must not re-trigger the query.
  // refreshMode returns null when a chip click won the race or the query
  // failed; the displayed value then stays as-is.
  useEffect(() => {
    refreshMode().then((mode) => {
      if (mode !== null) setCurrentMode(mode)
    }).catch(() => {
      // Keep the cached/first-paint value if the server query failed.
    })
  }, [])

  const options = APPROVAL_MODES

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
        portal
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
            <IconChevronDownOutlineRegular className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron} />
          </button>
        )}
      />
    </div>
  )
}

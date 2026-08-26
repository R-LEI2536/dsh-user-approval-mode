/**
 * Client plugin:
 *   - registers the approval mode chip in the composer tool row
 *   - registers an "Approval Modes" page in the Web UI settings sidebar
 *
 * Both registrations bind against the `approval-mode` settings namespace; the
 * chip routes through `/approval-mode` slash command (per-session mode switch),
 * while the settings page binds the user-editable section (all eight Config
 * fields). Settings writes flow through the settings RPC back to the server
 * plugin's `installSettingsSection` registration.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer dock seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the api-remotes merge for ctx.remote.commands.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-settings SlotMap merge (the settings.section seat).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ApprovalModeChip, type ApprovalModeChipInjected } from './ApprovalModeChip'
import { ApprovalModeSettings, type ApprovalModeSettingsInjected } from './ApprovalModeSettings'
import type { ApprovalMode, Config } from '../index'
import { en, zh, enPage, zhPage, type ApprovalKey, type ApprovalPageKey } from './locales'

export type { ApprovalKey, ApprovalPageKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The approval mode chip's copy. */
    approval: ApprovalKey
    /** The approval mode settings page copy (sidebar label, sub-section headers, field labels, controls). */
    'approval-page': ApprovalPageKey
  }
}

/** Dictionary namespace owned by the chip. */
const NS = 'approval'
/** Dictionary namespace owned by the settings page. */
const NS_PAGE = 'approval-page'
/** Settings slot id (matches the server-side namespace key for routing). */
const SETTINGS_ID = 'approval-mode'
/** Settings slot order: bottom of the sidebar, after the Plugins section. */
const SETTINGS_ORDER = 1100

/** Required services: slot registry, commands Remote, locale registry, settings scope, settings schema service. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale', 'settingsScope', 'settingsSchema']

/**
 * Per-session mode cache for the chip. Survives chip unmount/remount on session
 * switches so the chip can synchronously read the last displayed mode (no 'off'
 * flicker on revisit) and skip the server query entirely on cache hit. The Map
 * lives on the module scope, so a DSH restart (browser reload / HMR) drops it
 * along with everything else — no explicit cleanup needed. Bounded by the user's
 * active session count.
 */
const sessionModeCache = new Map<SessionId, ApprovalMode>()

/**
 * Client plugin body: register both the composer chip and the settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-user-approval: chip dictionary')
  ctx.effect(() => ctx.locale.register(NS_PAGE, { zh: zhPage, en: enPage }), 'dsh-user-approval: settings page dictionary')

  // Bound translate function for the settings page namespace. Stable per
  // namespace, reads the active locale at call time, so the slot label thunk
  // below picks up locale changes on each render without re-registration.
  const tPage = ctx.locale.bind(NS_PAGE)

  // ── Composer chip (per-session mode switch via /approval-mode command) ──
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: SETTINGS_ID,
    order: 10, // After the resident chrome (access-mode chip, plan seat)
    locale: NS,
    inject: (sessionId: SessionId): ApprovalModeChipInjected => ({
      cachedMode: sessionModeCache.get(sessionId) ?? null,
      switchMode: async (mode: string) => {
        console.log('[approval-mode] Switching to mode:', mode)
        // Third parameter is the images array; slash commands carry no images.
        const result = await ctx.remote.commands.execute(sessionId, `/approval-mode ${mode}`, [])
        console.log('[approval-mode] Command result:', result)
        if (!result.ok) {
          console.error('[approval-mode] Command failed:', result.error)
          return `${result.error.message} (${result.error.code})`
        }
        if (result.value === undefined) {
          console.error('[approval-mode] No result value')
          return 'unknown command: /approval-mode'
        }
        // The remote call succeeded but the command handler rejected the mode.
        if (result.value.result.kind === 'error') {
          console.error('[approval-mode] Command handler error:', result.value.result.text)
          return result.value.result.text
        }
        // Update the local cache so a later revisit doesn't re-fetch.
        sessionModeCache.set(sessionId, mode as ApprovalMode)
        console.log('[approval-mode] Successfully switched to:', mode)
        return null
      },
      getDefaultMode: async () => {
        // Cache hit: return immediately, no server roundtrip.
        const cached = sessionModeCache.get(sessionId)
        if (cached) return cached
        // Cache miss: query the server and backfill the cache.
        const result = await ctx.remote.commands.execute(sessionId, '/approval-mode', [])
        if (result.ok && result.value?.result.kind === 'success') {
          // Parse mode from "current approval mode: <mode> (available: ...)"
          const text = result.value.result.text
          if (text) {
            const match = text.match(/current approval mode: (\w+)/)
            const mode = match ? match[1] : 'off'
            sessionModeCache.set(sessionId, mode as ApprovalMode)
            return mode
          }
        }
        return 'off'
      },
    }),
  }, ApprovalModeChip))

  // ── Settings page (full-page editor for all eight Config fields) ──────
  // The page lives at the bottom of the sidebar (`order: 1100`, after the
  // Plugins section). It binds the same `approval-mode` settings namespace
  // that the server plugin's `installSettingsSection` exposed; user edits go
  // through `scope.set`/`scope.unset` and are persisted to the settings document.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SETTINGS_ID,
    order: SETTINGS_ORDER,
    label: () => tPage('nav.label'),
    locale: NS_PAGE,
    inject: (): ApprovalModeSettingsInjected => ({
      // Bind the scope on the caller's plugin lifecycle — the scope's disposer
      // is owned by this plugin's fiber. Binding adds no wire read of its own
      // because settings reads ride the shared describe mirror.
      scope: ctx.settingsScope.bind<Config>({ namespace: SETTINGS_ID }),
    }),
  }, ApprovalModeSettings))
}
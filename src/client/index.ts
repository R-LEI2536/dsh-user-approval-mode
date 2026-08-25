/**
 * Client plugin: registers the approval mode chip in the composer tool row,
 * beside the access-mode (permission) chip.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer.dock seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the api-remotes merge for ctx.remote.commands.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ApprovalModeChip, type ApprovalModeChipInjected } from './ApprovalModeChip'
import type { ApprovalMode } from '../index'
import { en, zh, type ApprovalKey } from './locales'

export type { ApprovalKey } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The approval mode chip's copy. */
    approval: ApprovalKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'approval'

/** Required services: the slot registry, commands Remote, and locale registry. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale']

/**
 * Per-session mode cache. Survives chip unmount/remount on session switches so the
 * chip can synchronously read the last displayed mode (no 'off' flicker on revisit)
 * and skip the server query entirely on cache hit. The Map lives on the module
 * scope, so a DSH restart (browser reload / HMR) drops it along with everything
 * else — no explicit cleanup needed. Bounded by the user's active session count.
 */
const sessionModeCache = new Map<SessionId, ApprovalMode>()

/**
 * Client plugin body: register the approval mode chip over the command channel.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-user-approval: dictionaries')

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'approval-mode',
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
}

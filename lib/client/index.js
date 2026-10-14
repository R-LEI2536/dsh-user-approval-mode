import { ApprovalModeChip } from './ApprovalModeChip';
import { ApprovalModeSettings } from './ApprovalModeSettings';
import { en, zh, enPage, zhPage } from './locales';
/** Dictionary namespace owned by the chip. `dsh-user-approval-mode*` prefix
 *  avoids colliding with the official `@deepseek-ai/dsh-user-approval` package
 *  (which also registers a locale named `approval`). */
const NS = 'dsh-user-approval-mode';
/** Dictionary namespace owned by the settings page. */
const NS_PAGE = 'dsh-user-approval-mode-page';
/** Settings slot id (page key in the settings sidebar; distinct from the profile entry id). */
const SETTINGS_ID = 'approval-mode';
/** Profile entry id = settings namespace key (`cordis.patch.yml` `id:`). */
const ENTRY_ID = 'dsh-user-approval-mode';
/** Settings slot order: bottom of the sidebar, after the Plugins section. */
const SETTINGS_ORDER = 1100;
/** Required services: slot registry, commands Remote, locale registry, configuration forms. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale', 'configForms'];
/**
 * Per-session mode cache for the chip. Survives chip unmount/remount on session
 * switches so the chip can synchronously read the last displayed mode (no 'off'
 * flicker on revisit) and skip the server query entirely on cache hit. The Map
 * lives on the module scope, so a DSH restart (browser reload / HMR) drops it
 * along with everything else — no explicit cleanup needed. Bounded by the user's
 * active session count.
 */
const sessionModeCache = new Map();
/**
 * Client plugin body: register both the composer chip and the settings page.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-user-approval: chip dictionary');
    ctx.effect(() => ctx.locale.register(NS_PAGE, { zh: zhPage, en: enPage }), 'dsh-user-approval: settings page dictionary');
    // Bound translate function for the settings page namespace. Stable per
    // namespace, reads the active locale at call time, so the slot label thunk
    // below picks up locale changes on each render without re-registration.
    const tPage = ctx.locale.bind(NS_PAGE);
    // ── Composer chip (per-session mode switch via /approval-mode command) ──
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: SETTINGS_ID,
        order: 10, // After the resident chrome (access-mode chip, plan seat)
        locale: NS,
        inject: (sessionId) => ({
            cachedMode: sessionModeCache.get(sessionId) ?? null,
            switchMode: async (mode) => {
                console.log('[approval-mode] Switching to mode:', mode);
                // Third parameter is the images array; slash commands carry no images.
                const result = await ctx.remote.commands.execute(sessionId, `/approval-mode ${mode}`, []);
                console.log('[approval-mode] Command result:', result);
                if (!result.ok) {
                    console.error('[approval-mode] Command failed:', result.error);
                    return `${result.error.message} (${result.error.code})`;
                }
                if (result.value === undefined) {
                    console.error('[approval-mode] No result value');
                    return 'unknown command: /approval-mode';
                }
                // The remote call succeeded but the command handler rejected the mode.
                if (result.value.result.kind === 'error') {
                    console.error('[approval-mode] Command handler error:', result.value.result.text);
                    return result.value.result.text;
                }
                // Update the local cache so a later revisit doesn't re-fetch.
                sessionModeCache.set(sessionId, mode);
                console.log('[approval-mode] Successfully switched to:', mode);
                return null;
            },
            getDefaultMode: async () => {
                // Cache hit: return immediately, no server roundtrip.
                const cached = sessionModeCache.get(sessionId);
                if (cached)
                    return cached;
                // Cache miss: query the server and backfill the cache.
                const result = await ctx.remote.commands.execute(sessionId, '/approval-mode', []);
                if (result.ok && result.value?.result.kind === 'success') {
                    // Parse mode from "current approval mode: <mode> (available: ...)"
                    const text = result.value.result.text;
                    if (text) {
                        const match = text.match(/current approval mode: (\w+)/);
                        const mode = match ? match[1] : 'off';
                        sessionModeCache.set(sessionId, mode);
                        return mode;
                    }
                }
                return 'off';
            },
        }),
    }, ApprovalModeChip));
    // ── Settings page (full-page editor for the eight user-editable fields) ──
    // The page lives at the bottom of the sidebar (`order: 1100`, after the
    // Plugins section). It binds the plugin entry's volatile Config via
    // `configForms.get`; user edits go through `form.set`/`form.unset` and are
    // persisted to the profile `cordis.patch.yml` user layer, where the Host
    // runtime folds them into the live volatile references.
    // The other 8 Config fields remain in the schema but are not editable here.
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: SETTINGS_ID,
        order: SETTINGS_ORDER,
        label: () => tPage('nav.label'),
        locale: NS_PAGE,
        inject: () => ({
            // Bind the configuration form on the caller's plugin lifecycle — the
            // form's disposer is owned by this plugin's fiber. Binding adds no wire
            // read of its own because settings reads ride the shared describe mirror.
            form: ctx.configForms.get(ENTRY_ID),
        }),
    }, ApprovalModeSettings));
}
//# sourceMappingURL=index.js.map
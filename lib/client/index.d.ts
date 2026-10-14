/**
 * Client plugin:
 *   - registers the approval mode chip in the composer tool row
 *   - registers an "Approval Modes" page in the Web UI settings sidebar
 *
 * Both registrations bind against the plugin entry's volatile Config: the
 * chip routes through `/approval-mode` slash command (per-session mode switch),
 * while the settings page binds the user-editable section (8 of the 16
 * Config fields — the rest stay deployer-only). Settings writes flow through
 * the configForms RPC back to the Host, whose runtime folds them into the
 * entry's profile user layer and updates the live volatile references.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type ApprovalKey, type ApprovalPageKey } from './locales';
export type { ApprovalKey, ApprovalPageKey } from './locales';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The approval mode chip's copy. */
        'dsh-user-approval-mode': ApprovalKey;
        /** The approval mode settings page copy (sidebar label, sub-section headers, field labels, controls). */
        'dsh-user-approval-mode-page': ApprovalPageKey;
    }
}
/** Required services: slot registry, commands Remote, locale registry, configuration forms. */
export declare const inject: string[];
/**
 * Client plugin body: register both the composer chip and the settings page.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map
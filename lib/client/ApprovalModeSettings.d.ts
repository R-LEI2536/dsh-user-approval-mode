import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { Config } from '../index';
import type { ApprovalPageKey } from './locales';
/** Injected business face from the client plugin. */
export interface ApprovalModeSettingsInjected {
    /** Live configuration form for the profile entry's volatile Config. */
    form: ConfigForm<Config>;
}
/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeSettingsProps = PropsRuntime<'settings.section'> & InjectFace<ApprovalModeSettingsInjected> & {
    t: (key: ApprovalPageKey) => string;
};
export declare function ApprovalModeSettings({ form, t }: ApprovalModeSettingsProps): import("react").JSX.Element;
//# sourceMappingURL=ApprovalModeSettings.d.ts.map
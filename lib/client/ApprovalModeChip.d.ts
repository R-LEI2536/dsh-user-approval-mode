import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots';
import type { ApprovalMode } from '../index';
import type { ApprovalKey } from './locales';
/** Injected business face from the client plugin. */
export interface ApprovalModeChipInjected {
    /** Last-known mode for this session from the client cache, or null on first visit. */
    cachedMode: ApprovalMode | null;
    /** Switch to a new approval mode by executing the /approval-mode command. */
    switchMode: (mode: string) => Promise<string | null>;
    /** Get the default approval mode from server config. */
    getDefaultMode: () => Promise<string>;
}
/** Full component props: runtime share + injected share + locale seat. */
export type ApprovalModeChipProps = PropsRuntime<'conversation.input.left'> & InjectFace<ApprovalModeChipInjected> & {
    t: (key: ApprovalKey) => string;
};
/**
 * Render the approval mode selector chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export declare function ApprovalModeChip({ cachedMode, switchMode, getDefaultMode, t }: ApprovalModeChipProps): import("react").JSX.Element;
//# sourceMappingURL=ApprovalModeChip.d.ts.map
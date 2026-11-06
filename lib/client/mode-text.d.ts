/**
 * Approval mode text helpers for the Web client.
 *
 * The server's no-arg `/approval-mode` command answers
 * `current approval mode: <mode> (available: ...)`. `auto-edit` carries a
 * hyphen, so the mode token is parsed as `[\w-]+` and checked against the
 * known set instead of trusted from the regex alone.
 */
import type { ApprovalMode } from '../index';
/** Modes the chip offers, in menu order. Mirrors the server's mode list. */
export declare const APPROVAL_MODES: readonly ApprovalMode[];
/**
 * Parse the mode out of a no-arg `/approval-mode` answer.
 * @param text - the command result text, or undefined when the host sent none.
 * @returns the parsed mode, or null when the text is missing or names no known mode.
 */
export declare function parseApprovalMode(text: string | undefined): ApprovalMode | null;
//# sourceMappingURL=mode-text.d.ts.map
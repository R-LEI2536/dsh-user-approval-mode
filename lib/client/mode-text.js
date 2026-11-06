/** Modes the chip offers, in menu order. Mirrors the server's mode list. */
export const APPROVAL_MODES = ['off', 'request', 'auto-edit', 'smart', 'yolo'];
/**
 * Parse the mode out of a no-arg `/approval-mode` answer.
 * @param text - the command result text, or undefined when the host sent none.
 * @returns the parsed mode, or null when the text is missing or names no known mode.
 */
export function parseApprovalMode(text) {
    if (text === undefined)
        return null;
    const match = text.match(/current approval mode: ([\w-]+)/);
    if (match === null)
        return null;
    const mode = match[1];
    return APPROVAL_MODES.includes(mode) ? mode : null;
}
//# sourceMappingURL=mode-text.js.map
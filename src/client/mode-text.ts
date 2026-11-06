/**
 * Approval mode text helpers for the Web client.
 *
 * The server's no-arg `/approval-mode` command answers
 * `current approval mode: <mode> (available: ...)`. `auto-edit` carries a
 * hyphen, so the mode token is parsed as `[\w-]+` and checked against the
 * known set instead of trusted from the regex alone.
 */
import type { ApprovalMode } from '../index'

/** Modes the chip offers, in menu order. Mirrors the server's mode list. */
export const APPROVAL_MODES: readonly ApprovalMode[] = ['off', 'request', 'auto-edit', 'smart', 'yolo']

/**
 * Parse the mode out of a no-arg `/approval-mode` answer.
 * @param text - the command result text, or undefined when the host sent none.
 * @returns the parsed mode, or null when the text is missing or names no known mode.
 */
export function parseApprovalMode(text: string | undefined): ApprovalMode | null {
  if (text === undefined) return null
  const match = text.match(/current approval mode: ([\w-]+)/)
  if (match === null) return null
  const mode = match[1]
  return (APPROVAL_MODES as readonly string[]).includes(mode) ? mode as ApprovalMode : null
}

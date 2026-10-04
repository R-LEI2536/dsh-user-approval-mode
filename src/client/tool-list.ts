/**
 * The wire format of the four tool-family Config fields (`editTools`,
 * `shellTools`, `readOnlyTools`, `autoAllowTools`): one comma-separated
 * string. The settings control renders it in a textarea and hands the typed
 * text back here, so these three functions are that format's only definition —
 * and, being React- and CSS-free, they are what `test/tool-list.test.ts` can
 * pin down without a DOM.
 */

/**
 * Parse edited text into the stored set: split on commas (and on newlines, so
 * a pasted multi-line list parses too), trim every token, drop empty tokens,
 * and deduplicate keeping the first occurrence.
 *
 * @param text - the raw textarea contents.
 * @returns The normalized tool list, in first-seen order.
 */
export function parseToolList(text: string): string[] {
  return [...new Set(text.split(/[,\n\r]+/).map(s => s.trim()).filter(s => s.length > 0))]
}

/**
 * Render the stored set back into the editable text.
 *
 * @param list - the stored tool names.
 * @returns The comma-and-space joined text.
 */
export function formatToolList(list: readonly string[]): string {
  return list.join(', ')
}

/**
 * Element-wise list equality: the commit no-op guard. A blur whose parsed
 * result equals the current value must not write at all.
 *
 * @param a - one list.
 * @param b - the other list.
 * @returns Whether both lists hold the same entries in the same order.
 */
export function sameToolList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index])
}

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
export declare function parseToolList(text: string): string[];
/**
 * Render the stored set back into the editable text.
 *
 * @param list - the stored tool names.
 * @returns The comma-and-space joined text.
 */
export declare function formatToolList(list: readonly string[]): string;
/**
 * Element-wise list equality: the commit no-op guard. A blur whose parsed
 * result equals the current value must not write at all.
 *
 * @param a - one list.
 * @param b - the other list.
 * @returns Whether both lists hold the same entries in the same order.
 */
export declare function sameToolList(a: readonly string[], b: readonly string[]): boolean;
//# sourceMappingURL=tool-list.d.ts.map
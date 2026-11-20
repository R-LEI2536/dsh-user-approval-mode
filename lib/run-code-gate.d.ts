/**
 * The PTC transport gate: classify a `run_code` program by its code
 * structure, not by its identity.
 *
 * `run_code` stays in `autoAllowTools` (the transport contract, ADR 0004),
 * but the top-level call is no longer allowed blindly. A program whose
 * every statement is a `tools.*` call (plus the variables and `return`
 * that receive its results) is allowed through — the sub-calls re-enter
 * this same gate under their real names. Anything else — arithmetic,
 * branching, imports, dynamic member access, or syntax the whitelist
 * does not recognize — asks the user, because a top-level dialog cannot
 * show the program and a silent `fs.rmSync` is exactly the hole this
 * closes (design page: docs/2026-11-07-run-code-approval-flow.html).
 *
 * The whitelist is deliberately strict: it recognizes rather than guesses.
 * An unrecognized construct fails closed to ask.
 */
/** Longest code summary appended to a top-level `run_code` ask reason. */
export declare const RUN_CODE_PREVIEW_MAX_CHARS = 200;
/**
 * Read a `run_code` program's source text from its arguments.
 * @param args - the tool call's parsed arguments.
 * @returns The `code` string, or `undefined` when the arguments carry no
 * readable program (anything else is the caller's fail-safe case).
 */
export declare function runCodeProgramFromArguments(args: unknown): string | undefined;
/**
 * Build the one-line code summary appended to a top-level `run_code` ask
 * reason. The host approval dialog shows no command block for `run_code`
 * (`ApprovalCommand.tsx` resolves only a bash `command`), so without this
 * suffix the prompt would be blind. Whitespace-collapsed for the same
 * reason as the PTC `[args: …]` summary: the dialog headline cannot
 * preserve line breaks. The full program is already durable in the
 * session log's tool-call event.
 */
export declare function runCodePreview(code: string): string;
/**
 * Decide whether a `run_code` program is "tool calls only".
 *
 * True means the program has no effect the plugin cannot see: every
 * statement is a `tools.*` call (each re-enters the gate as a sub-call),
 * a variable receiving one, or a `return` of trusted values. False means
 * ask — including unparseable code.
 *
 * This is a syntactic whitelist, NOT a security boundary: it exists to
 * keep the strict modes quiet for honest orchestrating programs. The hard
 * boundary under PTC remains the sandbox (ADR 0004).
 */
export declare function isToolCallsOnly(code: string): boolean;
//# sourceMappingURL=run-code-gate.d.ts.map
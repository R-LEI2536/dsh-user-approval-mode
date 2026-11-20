/**
 * The PTC transport gate: classify a `run_code` program by its code
 * structure, not by its identity.
 *
 * `run_code` stays in `autoAllowTools` (the transport contract, ADR 0004),
 * but the top-level call is no longer allowed blindly. The gate recognizes
 * statements in two grammars, mirroring the read-only git fast-path posture
 * (ADR 0003): a strict one and a widened one.
 *
 * - Strict: every statement is a `tools.*` call, a variable receiving one,
 *   or a `return` of trusted values. Allowed in every gated mode.
 * - Widened (on by default via `runCodePureExpressions`): statements may
 *   additionally be
 *   - call-free pure computation — arithmetic, comparisons, conditional
 *     expressions, template assembly, literal-index reads;
 *   - structured control flow — `if` / `for` / `while` / `switch` / `try`
 *     whose tests and bodies recursively stay inside this grammar (an
 *     `rmSync` hiding in a loop body still asks), plus local assignment to
 *     the program's own declared variables (loop counters);
 *   - a written-down list of pure builtin functions and methods
 *     (`Object.keys`, `Math.max`, `.map` / `.filter` / `.slice` / `.sort` /
 *     `JSON.parse` / …) on pure receivers, where callback bodies go through
 *     the SAME recursive check — `list.map(x => rmSync('./x'))` asks.
 *
 * The invariant both grammars keep: every effect a program can have is a
 * `tools.*` sub-call (each one re-enters the approval gate under its real
 * tool name) or a mutation of the program's own memory. Imports, `new`,
 * tagged templates, dynamic member access, a binding that shadows the
 * `tools` sub-call binding, any call not on the written-down lists, and
 * anything unparseable stay outside BOTH grammars and ask.
 *
 * The grammar recognizes, it does not guess; failure is closed. It is a
 * noise reducer, not a security boundary — the hard boundary under PTC
 * remains the sandbox (ADR 0004).
 *
 * Design page: docs/2026-11-07-run-code-approval-flow.html.
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
/** What the code-structure gate concluded about one top-level program. */
export type RunCodeGateVerdict = 
/** Every statement is a strict-grammar form. Allowed in every gated mode. */
'tools-only'
/** Recognized, but at least one statement (or call argument) uses the
 *  widened grammar. Allowed when `runCodePureExpressions` is on; asks
 *  otherwise. */
 | 'tools-and-pure'
/** Recognized, no `tools.*` sub-call shape at the statement level (a
 *  callback may still make gated calls). */
 | 'pure'
/** Something outside both grammars (or unparseable source): ask. */
 | 'ask';
/**
 * Classify a `run_code` program by its code structure.
 *
 * This is a syntactic recognizer, NOT a security boundary: it exists to
 * keep the gated modes quiet for honest programs (tool orchestration,
 * pure computation, recognized control flow) while everything
 * unrecognizable fails closed to a prompt (request/auto-edit) or the
 * smart pipeline's later steps. The hard boundary under PTC remains the
 * sandbox (ADR 0004).
 */
export declare function runCodeGateVerdict(code: string): RunCodeGateVerdict;
/**
 * Whether a verdict is an allow under the configured grammar width.
 * @param verdict - the classification of the program.
 * @param pureExpressions - the `runCodePureExpressions` switch: `true`
 * (default) admits the widened grammar (pure expressions, recognized
 * control flow, whitelisted builtin methods).
 */
export declare function runCodeGateAllows(verdict: RunCodeGateVerdict, pureExpressions: boolean): boolean;
//# sourceMappingURL=run-code-gate.d.ts.map
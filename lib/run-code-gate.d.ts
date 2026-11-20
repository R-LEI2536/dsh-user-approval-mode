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
 * - Widened (pure expressions, on by default via `runCodePureExpressions`):
 *   statements may additionally be call-free pure computation — arithmetic,
 *   comparisons, template assembly, literal-index reads — over literals,
 *   received results, and previously computed values. Such a program cannot
 *   touch anything outside its own memory: imports, direct calls, and
 *   dynamic member access stay out of both grammars.
 *
 * Anything the grammar does not recognize — branching, loops, functions,
 * imports, ANY call that is not `tools.*`, dynamic member access, or
 * unparseable source — asks under request/auto-edit and falls through to
 * the smart pipeline's later steps under smart. The whitelist recognizes,
 * it does not guess; failure is closed.
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
 *  widened pure-expression class. Allowed when `runCodePureExpressions`
 *  is on; asks otherwise. */
 | 'tools-and-pure'
/** Recognized, call-free pure computation, no `tools.*` call at all. */
 | 'pure'
/** Something outside both grammars (or unparseable source): ask. */
 | 'ask';
/**
 * Classify a `run_code` program by its code structure.
 *
 * This is a syntactic recognizer, NOT a security boundary: it exists to
 * keep the gated modes quiet for honest programs (tool orchestration and
 * pure computation) while everything unrecognizable fails closed to a
 * prompt (request/auto-edit) or the smart pipeline's later steps. The hard
 * boundary under PTC remains the sandbox (ADR 0004).
 */
export declare function runCodeGateVerdict(code: string): RunCodeGateVerdict;
/**
 * Whether a verdict is an allow under the configured grammar width.
 * @param verdict - the classification of the program.
 * @param pureExpressions - the `runCodePureExpressions` switch: `true`
 * (default) admits the widened pure-expression class.
 */
export declare function runCodeGateAllows(verdict: RunCodeGateVerdict, pureExpressions: boolean): boolean;
//# sourceMappingURL=run-code-gate.d.ts.map
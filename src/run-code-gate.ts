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

import { parse } from 'acorn'

/** Longest code summary appended to a top-level `run_code` ask reason. */
export const RUN_CODE_PREVIEW_MAX_CHARS = 200

/**
 * Read a `run_code` program's source text from its arguments.
 * @param args - the tool call's parsed arguments.
 * @returns The `code` string, or `undefined` when the arguments carry no
 * readable program (anything else is the caller's fail-safe case).
 */
export function runCodeProgramFromArguments(args: unknown): string | undefined {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined
  const code = (args as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

/**
 * Build the one-line code summary appended to a top-level `run_code` ask
 * reason. The host approval dialog shows no command block for `run_code`
 * (`ApprovalCommand.tsx` resolves only a bash `command`), so without this
 * suffix the prompt would be blind. Whitespace-collapsed for the same
 * reason as the PTC `[args: …]` summary: the dialog headline cannot
 * preserve line breaks. The full program is already durable in the
 * session log's tool-call event.
 */
export function runCodePreview(code: string): string {
  const oneLine = code.replace(/\s+/gu, ' ').trim()
  if (oneLine.length === 0) return '(empty program)'
  return oneLine.length <= RUN_CODE_PREVIEW_MAX_CHARS
    ? oneLine
    : `${oneLine.slice(0, RUN_CODE_PREVIEW_MAX_CHARS)}…`
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

/** Structural view of an acorn node; the grammar only ever reads `type`
 * and a handful of well-known fields. */
interface AcornNode {
  readonly type: string
  readonly [field: string]: unknown
}

/** Parse options mirror how the PTC runtime executes a program: a module-ish
 * body with top-level `await` and a final `return`. */
function parseProgramBody(code: string): readonly AcornNode[] | undefined {
  try {
    const program = parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    }) as unknown as AcornNode
    const body = program.body
    return Array.isArray(body) ? body as readonly AcornNode[] : undefined
  } catch {
    // Unparseable code is unclassifiable: fail closed.
    return undefined
  }
}

/** Ambient globals the design page singles out as ask-triggers. Reading any
 * other identifier is a pure reference (its binding is either a whitelisted
 * tool-call result or a runtime builtin the sandbox governs). */
const ASK_ONLY_IDENTIFIERS = new Set(['process', 'globalThis'])

function isPlainIdentifier(node: AcornNode): node is AcornNode & { name: string } {
  return node.type === 'Identifier' && typeof node.name === 'string'
}

// ─── Trusted values (the strict grammar's expression class) ─────────────────

/**
 * A trusted value: literals, identifiers (minus the ambient `process` /
 * `globalThis`), object / array literals of trusted values, and
 * non-computed member chains rooted at an identifier. This is what a
 * strict-grammar `tools.*` call's arguments and a strict `return` may be
 * built from.
 */
function isTrustedValue(node: AcornNode): boolean {
  switch (node.type) {
    case 'Literal':
      return true
    case 'Identifier':
      return !ASK_ONLY_IDENTIFIERS.has((node as { name?: unknown }).name as string)
    case 'ObjectExpression': {
      const properties = node.properties
      if (!Array.isArray(properties)) return false
      return properties.every((property) => {
        if (typeof property !== 'object' || property === null) return false
        const typed = property as AcornNode
        // Spread properties (`{...src}`) and computed keys are not trusted.
        if (typed.type !== 'Property') return false
        if (typed.computed === true) return false
        const key = typed.key as AcornNode | undefined
        if (key === undefined || (key.type !== 'Identifier' && key.type !== 'Literal')) return false
        return isTrustedValue(typed.value as AcornNode)
      })
    }
    case 'ArrayExpression': {
      const elements = node.elements
      if (!Array.isArray(elements)) return false
      return elements.every((element) => element === null || isTrustedValue(element as AcornNode))
    }
    case 'MemberExpression':
      // Dynamic member access (`obj[expr]`) is a design-page ask trigger.
      if (node.computed === true) return false
      return isTrustedValue(node.object as AcornNode) && isPlainIdentifier(node.property as AcornNode)
    default:
      return false
  }
}

// ─── Pure expressions (the widened grammar's expression class) ───────────────

/**
 * A pure expression: a superset of trusted values adding call-free
 * computation — binary / logical / unary (minus `delete`) operators,
 * conditional expressions, non-tagged template literals, spreads, and
 * member reads with a LITERAL index. Every data source is a literal, a
 * received result, or a previously computed value; there is no call to
 * hide an effect in. Anything else — calls, `new`, tagged templates,
 * dynamic imports, updates, assignments, function/class expressions,
 * `await` — is outside the grammar.
 */
function isPureExpression(node: AcornNode): boolean {
  switch (node.type) {
    case 'BinaryExpression':
    case 'LogicalExpression':
      return isPureExpression(node.left as AcornNode) && isPureExpression(node.right as AcornNode)
    case 'UnaryExpression':
      return node.operator !== 'delete' && isPureExpression(node.argument as AcornNode)
    case 'ConditionalExpression':
      return isPureExpression(node.test as AcornNode)
        && isPureExpression(node.consequent as AcornNode)
        && isPureExpression(node.alternate as AcornNode)
    case 'TemplateLiteral': {
      const expressions = node.expressions
      return Array.isArray(expressions)
        && expressions.every((expression) => isPureExpression(expression as AcornNode))
    }
    case 'MemberExpression': {
      const property = node.property as AcornNode | undefined
      if (node.computed === true) {
        // Literal-index reads only; a dynamic key (`r.body[i]`, `obj[k()]`)
        // stays outside the widened grammar.
        return property !== undefined && property.type === 'Literal' && isPureExpression(node.object as AcornNode)
      }
      return isPureExpression(node.object as AcornNode) && isPlainIdentifier(property as AcornNode)
    }
    case 'ObjectExpression': {
      const properties = node.properties
      if (!Array.isArray(properties)) return false
      return properties.every((property) => {
        if (typeof property !== 'object' || property === null) return false
        const typed = property as AcornNode
        if (typed.type === 'SpreadElement') return isPureExpression(typed.argument as AcornNode)
        if (typed.type !== 'Property' || typed.computed === true) return false
        const key = typed.key as AcornNode | undefined
        if (key === undefined || (key.type !== 'Identifier' && key.type !== 'Literal')) return false
        return isPureExpression(typed.value as AcornNode)
      })
    }
    case 'ArrayExpression': {
      const elements = node.elements
      if (!Array.isArray(elements)) return false
      return elements.every((element) => {
        if (element === null) return true
        const typed = element as AcornNode
        if (typed.type === 'SpreadElement') return isPureExpression(typed.argument as AcornNode)
        return isPureExpression(typed)
      })
    }
    default:
      // Literals and identifiers are shared with the strict class.
      return isTrustedValue(node)
  }
}

// ─── Tools-call shape ────────────────────────────────────────────────────────

/**
 * Classify the call shape of a `tools.*` invocation (optionally awaited).
 * @returns `'tool'` when every argument is a trusted value (strict
 * grammar), `'tool-pure'` when every argument is a pure expression but at
 * least one exceeds the strict class (so the statement only passes under
 * the widened grammar), and `undefined` when the node is not a plain,
 * non-computed `tools.<name>(…)` call.
 */
function toolsCallClass(node: AcornNode): 'tool' | 'tool-pure' | undefined {
  const call = node.type === 'AwaitExpression'
    ? node.argument as AcornNode | undefined
    : node
  if (call === undefined || call.type !== 'CallExpression') return undefined
  const callee = call.callee as AcornNode | undefined
  if (callee === undefined || callee.type !== 'MemberExpression' || callee.computed === true) return undefined
  const object = callee.object as AcornNode | undefined
  if (object === undefined || !isPlainIdentifier(object) || object.name !== 'tools') return undefined
  const property = callee.property as AcornNode | undefined
  if (property === undefined || !isPlainIdentifier(property)) return undefined
  const args = call.arguments
  if (!Array.isArray(args)) return undefined
  if (args.every((argument) => isTrustedValue(argument as AcornNode))) return 'tool'
  if (args.every((argument) => isPureExpression(argument as AcornNode))) return 'tool-pure'
  return undefined
}

// ─── Statement classification ─────────────────────────────────────────────────

/**
 * One top-level statement's contribution to the verdict:
 * - `'tool'` — a strict-grammar `tools.*` form;
 * - `'tool-pure'` — a `tools.*` call whose arguments use the widened
 *   expression class;
 * - `'pure'` — a call-free pure statement (widened grammar only);
 * - `'strict'` — a `return` of trusted values (or a bare `return`),
 *   allowed by the strict grammar without widening;
 * - `'bad'` — anything unrecognized: the program asks.
 */
type StatementClass = 'tool' | 'tool-pure' | 'pure' | 'strict' | 'bad'

function classifyStatement(statement: AcornNode): StatementClass {
  switch (statement.type) {
    case 'ExpressionStatement': {
      const expression = statement.expression as AcornNode | undefined
      if (expression === undefined) return 'bad'
      const call = toolsCallClass(expression)
      if (call !== undefined) return call
      return isPureExpression(expression) ? 'pure' : 'bad'
    }
    case 'VariableDeclaration': {
      // Only "receive a tool-call result" or "compute a pure value"
      // declarations: every declarator binds a plain identifier (no
      // destructuring) to a recognized initializer.
      const declarations = statement.declarations
      if (!Array.isArray(declarations) || declarations.length === 0) return 'bad'
      let sawTool = false
      let sawPure = false
      let sawBad = false
      for (const declarator of declarations) {
        if (typeof declarator !== 'object' || declarator === null) return 'bad'
        const typed = declarator as AcornNode
        if (typed.type !== 'VariableDeclarator') return 'bad'
        if (!isPlainIdentifier(typed.id as AcornNode)) return 'bad'
        const init = typed.init as AcornNode | null | undefined
        if (init === null || init === undefined) return 'bad'
        const call = toolsCallClass(init)
        if (call === 'tool') sawTool = true
        else if (call === 'tool-pure') { sawTool = true; sawPure = true }
        else if (isPureExpression(init)) sawPure = true
        else sawBad = true
      }
      if (sawBad) return 'bad'
      if (sawTool) return sawPure ? 'tool-pure' : 'tool'
      return 'pure'
    }
    case 'ReturnStatement': {
      const argument = statement.argument as AcornNode | null | undefined
      if (argument === null || argument === undefined) return 'strict'
      if (isTrustedValue(argument)) return 'strict'
      return isPureExpression(argument) ? 'pure' : 'bad'
    }
    default:
      // if / for / while / function / class / import / export / block /
      // try / throw / switch / assignment … all ask.
      return 'bad'
  }
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

/** What the code-structure gate concluded about one top-level program. */
export type RunCodeGateVerdict =
  /** Every statement is a strict-grammar form. Allowed in every gated mode. */
  | 'tools-only'
  /** Recognized, but at least one statement (or call argument) uses the
   *  widened pure-expression class. Allowed when `runCodePureExpressions`
   *  is on; asks otherwise. */
  | 'tools-and-pure'
  /** Recognized, call-free pure computation, no `tools.*` call at all. */
  | 'pure'
  /** Something outside both grammars (or unparseable source): ask. */
  | 'ask'

/**
 * Classify a `run_code` program by its code structure.
 *
 * This is a syntactic recognizer, NOT a security boundary: it exists to
 * keep the gated modes quiet for honest programs (tool orchestration and
 * pure computation) while everything unrecognizable fails closed to a
 * prompt (request/auto-edit) or the smart pipeline's later steps. The hard
 * boundary under PTC remains the sandbox (ADR 0004).
 */
export function runCodeGateVerdict(code: string): RunCodeGateVerdict {
  const body = parseProgramBody(code)
  if (body === undefined) return 'ask'
  let sawTool = false
  let sawPure = false
  for (const statement of body) {
    const statementClass = classifyStatement(statement)
    if (statementClass === 'bad') return 'ask'
    // 'strict' (a return of trusted values) never widens the grammar: it
    // exists in the strict class precisely to hand back tool results, so it
    // contributes no flag of its own.
    if (statementClass === 'tool' || statementClass === 'tool-pure') sawTool = true
    if (statementClass === 'tool-pure' || statementClass === 'pure') sawPure = true
  }
  if (sawPure) return sawTool ? 'tools-and-pure' : 'pure'
  return 'tools-only'
}

/**
 * Whether a verdict is an allow under the configured grammar width.
 * @param verdict - the classification of the program.
 * @param pureExpressions - the `runCodePureExpressions` switch: `true`
 * (default) admits the widened pure-expression class.
 */
export function runCodeGateAllows(verdict: RunCodeGateVerdict, pureExpressions: boolean): boolean {
  if (verdict === 'tools-only') return true
  return pureExpressions && (verdict === 'tools-and-pure' || verdict === 'pure')
}

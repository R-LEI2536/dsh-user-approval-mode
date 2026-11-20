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

// ─── AST whitelist ───────────────────────────────────────────────────────────

/** Structural view of an acorn node; the whitelist only ever reads `type`
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

/**
 * A value expression the whitelist trusts: literals, identifiers, object /
 * array literals of trusted values, and non-computed member chains rooted
 * at an identifier. This is what tool-call arguments and a `return` may be
 * built from. Anything else — arithmetic, concatenation, template
 * expressions, calls, computed (dynamic) member access — asks.
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

/**
 * A `tools.*` call, optionally awaited: `(await )? tools.<name>(args…)`.
 * The callee must be a plain, non-computed member of the `tools` binding
 * and every argument must be a trusted value.
 */
function isToolsCall(node: AcornNode): boolean {
  const call = node.type === 'AwaitExpression'
    ? node.argument as AcornNode | undefined
    : node
  if (call === undefined || call.type !== 'CallExpression') return false
  const callee = call.callee as AcornNode | undefined
  if (callee === undefined || callee.type !== 'MemberExpression' || callee.computed === true) return false
  const object = callee.object as AcornNode | undefined
  if (object === undefined || !isPlainIdentifier(object) || object.name !== 'tools') return false
  const property = callee.property as AcornNode | undefined
  if (property === undefined || !isPlainIdentifier(property)) return false
  const args = call.arguments
  return Array.isArray(args) && args.every((argument) => isTrustedValue(argument as AcornNode))
}

/** One top-level statement the whitelist allows. Everything else asks. */
function isAllowedStatement(statement: AcornNode): boolean {
  switch (statement.type) {
    case 'ExpressionStatement':
      return isToolsCall(statement.expression as AcornNode)
    case 'VariableDeclaration': {
      // Only "receive a tool-call result" declarations: every declarator
      // binds a plain identifier to a `tools.*` call.
      const declarations = statement.declarations
      if (!Array.isArray(declarations) || declarations.length === 0) return false
      return declarations.every((declarator) => {
        if (typeof declarator !== 'object' || declarator === null) return false
        const typed = declarator as AcornNode
        if (typed.type !== 'VariableDeclarator') return false
        if (!isPlainIdentifier(typed.id as AcornNode)) return false
        const init = typed.init as AcornNode | null | undefined
        return init !== null && init !== undefined && isToolsCall(init)
      })
    }
    case 'ReturnStatement': {
      const argument = statement.argument as AcornNode | null | undefined
      return argument === null || argument === undefined || isTrustedValue(argument)
    }
    default:
      // if / for / while / function / class / import / export / block /
      // try / throw / switch / assignment … all ask.
      return false
  }
}

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
export function isToolCallsOnly(code: string): boolean {
  const body = parseProgramBody(code)
  if (body === undefined) return false
  return body.every(isAllowedStatement)
}

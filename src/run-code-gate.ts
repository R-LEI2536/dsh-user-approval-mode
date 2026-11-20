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

/** The sub-call binding. A program that binds this name anywhere — a
 * variable declaration, a `for` binding, a catch parameter, a callback
 * parameter — turns would-be gated `tools.*` calls into unguarded plain
 * calls, so the whole program asks. */
const SUB_CALL_BINDING = 'tools'

function isPlainIdentifier(node: AcornNode): node is AcornNode & { name: string } {
  return node.type === 'Identifier' && typeof node.name === 'string'
}

// ─── The written-down builtin whitelists ─────────────────────────────────────

/**
 * Global function calls recognized as pure. A direct call of a name NOT on
 * this list is an unrecognized call: the program asks. Recognize, don't
 * guess — `eval`, `setTimeout`, `fetch` & co. are deliberately absent.
 */
const PURE_GLOBAL_FUNCTIONS = new Set([
  'Number', 'String', 'Boolean',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
])

/**
 * Member calls recognized as pure when the receiver is a pure expression:
 * the array / string / number assembly surfaces plus the Object / JSON /
 * Math / RegExp surfaces. Mutating members (`sort`, `reverse`, `push`,
 * `splice`, …) count as pure too — they touch only the program's own
 * memory, which the sandbox never observes. A method name NOT on this list
 * asks, whatever the receiver.
 */
const PURE_METHODS = new Set([
  // array-ish
  'at', 'concat', 'copyWithin', 'entries', 'every', 'fill', 'filter', 'find',
  'findIndex', 'findLast', 'findLastIndex', 'flat', 'flatMap', 'forEach',
  'includes', 'indexOf', 'isArray', 'join', 'keys', 'lastIndexOf', 'map',
  'pop', 'push', 'reduce', 'reduceRight', 'reverse', 'shift', 'slice',
  'some', 'sort', 'splice', 'unshift', 'values',
  // string-ish
  'charAt', 'charCodeAt', 'codePointAt', 'endsWith', 'localeCompare',
  'match', 'matchAll', 'normalize', 'padEnd', 'padStart', 'repeat',
  'replace', 'replaceAll', 'split', 'startsWith', 'substr', 'substring',
  'toLowerCase', 'toUpperCase', 'trim', 'trimEnd', 'trimStart',
  // Object / JSON / Math / RegExp surfaces (receiver must still be pure)
  'abs', 'ceil', 'exec', 'floor', 'max', 'min', 'parse', 'pow', 'round',
  'sign', 'sqrt', 'stringify', 'test', 'trunc',
])

// ─── Classification context ───────────────────────────────────────────────────

/** Per-program classification state: every identifier the program declares
 * (variables, loop bindings, catch parameters, callback parameters). Local
 * assignment is allowed only for these names, so assignment can never
 * reach anything outside the program's own memory. */
interface GateContext {
  readonly declared: ReadonlySet<string>
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
 * conditional expressions, non-tagged template literals, spreads, member
 * reads with a LITERAL index — plus the two widened forms: assignment /
 * update of a DECLARED local variable, and calls on the written-down
 * builtin whitelists (with callback bodies recursively checked). Every
 * data source is a literal, a received result, or a previously computed
 * value; there is no unrecognized call to hide an effect in.
 */
function isPureExpression(ctx: GateContext, node: AcornNode): boolean {
  switch (node.type) {
    case 'BinaryExpression':
    case 'LogicalExpression':
      return isPureExpression(ctx, node.left as AcornNode) && isPureExpression(ctx, node.right as AcornNode)
    case 'UnaryExpression':
      return node.operator !== 'delete' && isPureExpression(ctx, node.argument as AcornNode)
    case 'ConditionalExpression':
      return isPureExpression(ctx, node.test as AcornNode)
        && isPureExpression(ctx, node.consequent as AcornNode)
        && isPureExpression(ctx, node.alternate as AcornNode)
    case 'TemplateLiteral': {
      const expressions = node.expressions
      return Array.isArray(expressions)
        && expressions.every((expression) => isPureExpression(ctx, expression as AcornNode))
    }
    case 'MemberExpression': {
      const property = node.property as AcornNode | undefined
      if (node.computed === true) {
        // Literal-index reads only; a dynamic key (`r.body[i]`, `obj[k()]`)
        // stays outside the widened grammar.
        return property !== undefined && property.type === 'Literal' && isPureExpression(ctx, node.object as AcornNode)
      }
      return isPureExpression(ctx, node.object as AcornNode) && isPlainIdentifier(property as AcornNode)
    }
    case 'ObjectExpression': {
      const properties = node.properties
      if (!Array.isArray(properties)) return false
      return properties.every((property) => {
        if (typeof property !== 'object' || property === null) return false
        const typed = property as AcornNode
        if (typed.type === 'SpreadElement') return isPureExpression(ctx, typed.argument as AcornNode)
        if (typed.type !== 'Property' || typed.computed === true) return false
        const key = typed.key as AcornNode | undefined
        if (key === undefined || (key.type !== 'Identifier' && key.type !== 'Literal')) return false
        return isPureExpression(ctx, typed.value as AcornNode)
      })
    }
    case 'ArrayExpression': {
      const elements = node.elements
      if (!Array.isArray(elements)) return false
      return elements.every((element) => {
        if (element === null) return true
        const typed = element as AcornNode
        if (typed.type === 'SpreadElement') return isPureExpression(ctx, typed.argument as AcornNode)
        return isPureExpression(ctx, typed)
      })
    }
    case 'AssignmentExpression': {
      // Local mutation only: the target must be a variable this program
      // declares. Assigning anything else (a member, an undeclared name)
      // asks.
      const target = node.left as AcornNode | undefined
      if (target === undefined || !isPlainIdentifier(target) || !ctx.declared.has(target.name)) return false
      return isPureExpression(ctx, node.right as AcornNode)
    }
    case 'UpdateExpression': {
      // `i += 1` / `i++` for loop counters: declared identifiers only.
      const argument = node.argument as AcornNode | undefined
      return argument !== undefined && isPlainIdentifier(argument) && ctx.declared.has(argument.name)
    }
    case 'SequenceExpression': {
      // `i += 1, j += 1` in a classic `for` update slot.
      const expressions = node.expressions
      return Array.isArray(expressions)
        && expressions.every((expression) => isPureExpression(ctx, expression as AcornNode))
    }
    case 'CallExpression':
      // Pure builtin calls only (whitelisted function or method, pure
      // receiver, arguments pure or recognized callbacks).
      return recognizedBuiltinCall(ctx, node)
    default:
      // Literals and identifiers are shared with the strict class.
      return isTrustedValue(node)
  }
}

/** A callback argument inside a whitelisted builtin call (`.map` /
 * `.filter` / `.sort` / …). The callback's body goes through the SAME
 * grammar: tools calls inside stay gated sub-calls, pure computation stays
 * pure, and an `rmSync` (or any unrecognized call) inside makes the whole
 * program ask. Params must be plain identifiers and must never shadow the
 * sub-call binding. */
function isRecognizedCallback(ctx: GateContext, node: AcornNode): boolean {
  if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') return false
  if (node.generator === true) return false
  const params = node.params
  if (!Array.isArray(params)) return false
  const localDeclared = new Set(ctx.declared)
  for (const param of params) {
    if (typeof param !== 'object' || param === null) return false
    const typed = param as AcornNode
    if (!isPlainIdentifier(typed)) return false
    if (typed.name === SUB_CALL_BINDING) return false
    localDeclared.add(typed.name)
  }
  const localCtx: GateContext = { declared: localDeclared }
  const body = node.body as AcornNode | undefined
  if (body === undefined) return false
  if (body.type === 'BlockStatement') {
    const statements = body.body
    return Array.isArray(statements) && classifyNestedStatements(localCtx, statements as AcornNode[]) !== 'bad'
  }
  return isPureExpression(localCtx, body)
}

/** A call whose callee is a whitelisted global function, or a whitelisted
 * method on a pure receiver, with every argument a pure expression or a
 * recognized callback. */
function recognizedBuiltinCall(ctx: GateContext, node: AcornNode): boolean {
  const callee = node.callee as AcornNode | undefined
  if (callee === undefined) return false
  if (isPlainIdentifier(callee)) {
    if (!PURE_GLOBAL_FUNCTIONS.has(callee.name)) return false
  } else if (callee.type === 'MemberExpression' && callee.computed !== true) {
    const object = callee.object as AcornNode | undefined
    const property = callee.property as AcornNode | undefined
    if (object === undefined || property === undefined || !isPlainIdentifier(property)) return false
    if (!PURE_METHODS.has(property.name)) return false
    if (!isPureExpression(ctx, object)) return false
  } else {
    return false
  }
  const args = node.arguments
  if (!Array.isArray(args)) return false
  return args.every((argument) => {
    if (typeof argument !== 'object' || argument === null) return false
    const typed = argument as AcornNode
    return isPureExpression(ctx, typed) || isRecognizedCallback(ctx, typed)
  })
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
function toolsCallClass(ctx: GateContext, node: AcornNode): 'tool' | 'tool-pure' | undefined {
  const call = node.type === 'AwaitExpression'
    ? node.argument as AcornNode | undefined
    : node
  if (call === undefined || call.type !== 'CallExpression') return undefined
  const callee = call.callee as AcornNode | undefined
  if (callee === undefined || callee.type !== 'MemberExpression' || callee.computed === true) return undefined
  const object = callee.object as AcornNode | undefined
  if (object === undefined || !isPlainIdentifier(object) || object.name !== SUB_CALL_BINDING) return undefined
  const property = callee.property as AcornNode | undefined
  if (property === undefined || !isPlainIdentifier(property)) return undefined
  const args = call.arguments
  if (!Array.isArray(args)) return undefined
  if (args.every((argument) => isTrustedValue(argument as AcornNode))) return 'tool'
  if (args.every((argument) => isPureExpression(ctx, argument as AcornNode))) return 'tool-pure'
  return undefined
}

// ─── Statement classification ─────────────────────────────────────────────────

/**
 * One statement's contribution to the verdict:
 * - `'tool'` — a strict-grammar `tools.*` form;
 * - `'tool-pure'` — a `tools.*` call (or compound statement) that needs the
 *   widened grammar;
 * - `'pure'` — a call-free pure statement (widened grammar only);
 * - `'strict'` — a form the strict grammar accepts with no width flags of
 *   its own (a `return` of trusted values, a bare `return`, `break` /
 *   `continue`, an empty statement);
 * - `'bad'` — anything unrecognized: the program asks.
 */
type StatementClass = 'tool' | 'tool-pure' | 'pure' | 'strict' | 'bad'

/**
 * Aggregate classification for a nested statement list — a block body, loop
 * body, case consequents, or a callback body. Compound context always needs
 * the widened grammar (the strict grammar knows no control flow), so the
 * result is never neutral: `'bad'` if any inner statement asks, otherwise
 * the inner flags widened by one.
 */
function classifyNestedStatements(ctx: GateContext, statements: readonly AcornNode[]): 'bad' | 'pure' | 'tool-pure' {
  let sawTool = false
  let sawPure = false
  for (const statement of statements) {
    const statementClass = classifyStatement(ctx, statement)
    if (statementClass === 'bad') return 'bad'
    if (statementClass === 'tool' || statementClass === 'tool-pure') sawTool = true
    if (statementClass === 'tool-pure' || statementClass === 'pure') sawPure = true
  }
  return sawTool ? 'tool-pure' : 'pure'
}

/** Classify one statement; see `StatementClass`. */
function classifyStatement(ctx: GateContext, statement: AcornNode): StatementClass {
  switch (statement.type) {
    case 'ExpressionStatement': {
      const expression = statement.expression as AcornNode | undefined
      if (expression === undefined) return 'bad'
      const call = toolsCallClass(ctx, expression)
      if (call !== undefined) return call
      return isPureExpression(ctx, expression) ? 'pure' : 'bad'
    }
    case 'VariableDeclaration': {
      // "Receive a tool-call result" or "compute a pure value" declarations:
      // every declarator binds a plain identifier (no destructuring) to a
      // recognized initializer.
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
        const call = toolsCallClass(ctx, init)
        if (call === 'tool') sawTool = true
        else if (call === 'tool-pure') { sawTool = true; sawPure = true }
        else if (isPureExpression(ctx, init)) sawPure = true
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
      return isPureExpression(ctx, argument) ? 'pure' : 'bad'
    }
    case 'BlockStatement': {
      const inner = statement.body
      if (!Array.isArray(inner)) return 'bad'
      return classifyNestedStatements(ctx, inner as AcornNode[])
    }
    case 'IfStatement': {
      const test = statement.test as AcornNode | undefined
      const consequent = statement.consequent as AcornNode | undefined
      if (test === undefined || !isPureExpression(ctx, test)) return 'bad'
      if (consequent === undefined) return 'bad'
      const branches: AcornNode[] = [consequent]
      const alternate = statement.alternate as AcornNode | null | undefined
      if (alternate !== null && alternate !== undefined) branches.push(alternate)
      return classifyNestedStatements(ctx, branches)
    }
    case 'ForStatement': {
      const init = statement.init as AcornNode | null | undefined
      if (init !== null && init !== undefined) {
        if (init.type === 'VariableDeclaration') {
          if (classifyStatement(ctx, init) === 'bad') return 'bad'
        } else if (!isPureExpression(ctx, init)) {
          return 'bad'
        }
      }
      const test = statement.test as AcornNode | null | undefined
      if (test !== null && test !== undefined && !isPureExpression(ctx, test)) return 'bad'
      const update = statement.update as AcornNode | null | undefined
      if (update !== null && update !== undefined && !isPureExpression(ctx, update)) return 'bad'
      const body = statement.body as AcornNode | undefined
      if (body === undefined) return 'bad'
      return classifyNestedStatements(ctx, [body])
    }
    case 'ForOfStatement':
    case 'ForInStatement': {
      const left = statement.left as AcornNode | undefined
      const right = statement.right as AcornNode | undefined
      if (left === undefined || right === undefined || !isPureExpression(ctx, right)) return 'bad'
      if (left.type === 'VariableDeclaration') {
        // `for (const p of xs)`: one plain-identifier binding, no initializer.
        const declarations = left.declarations
        if (!Array.isArray(declarations) || declarations.length !== 1) return 'bad'
        const declarator = declarations[0] as AcornNode | undefined
        if (declarator === undefined || declarator.type !== 'VariableDeclarator') return 'bad'
        if (!isPlainIdentifier(declarator.id as AcornNode)) return 'bad'
        if (declarator.init !== null && declarator.init !== undefined) return 'bad'
      } else if (!isPlainIdentifier(left) || !ctx.declared.has(left.name)) {
        // `for (p of xs)` with a previously declared loop variable.
        return 'bad'
      }
      const body = statement.body as AcornNode | undefined
      if (body === undefined) return 'bad'
      return classifyNestedStatements(ctx, [body])
    }
    case 'WhileStatement':
    case 'DoWhileStatement': {
      const test = statement.test as AcornNode | undefined
      const body = statement.body as AcornNode | undefined
      if (test === undefined || !isPureExpression(ctx, test)) return 'bad'
      if (body === undefined) return 'bad'
      return classifyNestedStatements(ctx, [body])
    }
    case 'SwitchStatement': {
      const discriminant = statement.discriminant as AcornNode | undefined
      if (discriminant === undefined || !isPureExpression(ctx, discriminant)) return 'bad'
      const cases = statement.cases
      if (!Array.isArray(cases)) return 'bad'
      const statements: AcornNode[] = []
      for (const switchCase of cases) {
        if (typeof switchCase !== 'object' || switchCase === null) return 'bad'
        const typed = switchCase as AcornNode
        if (typed.type !== 'SwitchCase') return 'bad'
        const test = typed.test as AcornNode | null | undefined
        if (test !== null && test !== undefined && !isPureExpression(ctx, test)) return 'bad'
        const consequent = typed.consequent
        if (!Array.isArray(consequent)) return 'bad'
        for (const inner of consequent) {
          if (typeof inner !== 'object' || inner === null) return 'bad'
          statements.push(inner as AcornNode)
        }
      }
      return classifyNestedStatements(ctx, statements)
    }
    case 'TryStatement': {
      const block = statement.block as AcornNode | undefined
      if (block === undefined || block.type !== 'BlockStatement' || !Array.isArray(block.body)) return 'bad'
      const statements: AcornNode[] = [...block.body as AcornNode[]]
      const handler = statement.handler as AcornNode | null | undefined
      if (handler !== null && handler !== undefined) {
        if (handler.type !== 'CatchClause') return 'bad'
        // `catch ({ code })` destructuring asks; a plain identifier is fine.
        const param = handler.param as AcornNode | null | undefined
        if (param !== null && param !== undefined && !isPlainIdentifier(param)) return 'bad'
        const handlerBody = handler.body as AcornNode | undefined
        if (handlerBody === undefined || handlerBody.type !== 'BlockStatement' || !Array.isArray(handlerBody.body)) return 'bad'
        statements.push(...(handlerBody.body as AcornNode[]))
      }
      const finalizer = statement.finalizer as AcornNode | null | undefined
      if (finalizer !== null && finalizer !== undefined) {
        if (finalizer.type !== 'BlockStatement' || !Array.isArray(finalizer.body)) return 'bad'
        statements.push(...(finalizer.body as AcornNode[]))
      }
      return classifyNestedStatements(ctx, statements)
    }
    case 'LabeledStatement': {
      const body = statement.body as AcornNode | undefined
      if (body === undefined) return 'bad'
      const inner = classifyStatement(ctx, body)
      if (inner === 'bad') return 'bad'
      // A label is control flow: even a tools-only body needs the width.
      return inner === 'tool' || inner === 'tool-pure' ? 'tool-pure' : 'pure'
    }
    case 'BreakStatement':
    case 'ContinueStatement': {
      const label = statement.label as AcornNode | null | undefined
      return label === null || label === undefined || isPlainIdentifier(label) ? 'strict' : 'bad'
    }
    case 'ThrowStatement': {
      const argument = statement.argument as AcornNode | undefined
      if (argument === undefined) return 'bad'
      if (isTrustedValue(argument)) return 'strict'
      return isPureExpression(ctx, argument) ? 'pure' : 'bad'
    }
    case 'EmptyStatement':
      return 'strict'
    default:
      // function / class declarations, imports, exports, directives with
      // effects, `debugger`, and anything else … all ask.
      return 'bad'
  }
}

// ─── Declared-name collection ────────────────────────────────────────────────

/**
 * Collect every identifier the program declares — variables (including
 * loop and `for`-init bindings), catch parameters, and function / arrow
 * parameters. Used for two rules: local assignment is allowed only for
 * declared names, and a program that shadows the `tools` binding anywhere
 * asks as a whole.
 */
function collectDeclaredNames(node: AcornNode, into: Set<string>): void {
  switch (node.type) {
    case 'VariableDeclarator': {
      const id = node.id as AcornNode | undefined
      if (id !== undefined && isPlainIdentifier(id)) into.add(id.name)
      break
    }
    case 'CatchClause': {
      const param = node.param as AcornNode | null | undefined
      if (param !== null && param !== undefined && isPlainIdentifier(param)) into.add(param.name)
      break
    }
    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'FunctionExpression': {
      const params = node.params
      if (Array.isArray(params)) {
        for (const param of params) {
          if (typeof param === 'object' && param !== null && isPlainIdentifier(param as AcornNode)) {
            into.add((param as AcornNode & { name: string }).name)
          }
        }
      }
      break
    }
    default:
      break
  }
  // Recurse into child nodes generically (object fields holding nodes, and
  // arrays holding nodes).
  for (const value of Object.values(node)) {
    if (typeof value !== 'object' || value === null) continue
    if (typeof (value as AcornNode).type === 'string') {
      collectDeclaredNames(value as AcornNode, into)
    } else if (Array.isArray(value)) {
      for (const element of value) {
        if (typeof element !== 'object' || element === null) continue
        if (typeof (element as AcornNode).type === 'string') collectDeclaredNames(element as AcornNode, into)
      }
    }
  }
}

// ─── Verdict ──────────────────────────────────────────────────────────────────

/** What the code-structure gate concluded about one top-level program. */
export type RunCodeGateVerdict =
  /** Every statement is a strict-grammar form. Allowed in every gated mode. */
  | 'tools-only'
  /** Recognized, but at least one statement (or call argument) uses the
   *  widened grammar. Allowed when `runCodePureExpressions` is on; asks
   *  otherwise. */
  | 'tools-and-pure'
  /** Recognized, no `tools.*` sub-call shape at the statement level (a
   *  callback may still make gated calls). */
  | 'pure'
  /** Something outside both grammars (or unparseable source): ask. */
  | 'ask'

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
export function runCodeGateVerdict(code: string): RunCodeGateVerdict {
  const body = parseProgramBody(code)
  if (body === undefined) return 'ask'
  const declared = new Set<string>()
  for (const statement of body) collectDeclaredNames(statement, declared)
  // Shadowing the sub-call binding anywhere invalidates the whole program.
  if (declared.has(SUB_CALL_BINDING)) return 'ask'
  const ctx: GateContext = { declared }
  let sawTool = false
  let sawPure = false
  for (const statement of body) {
    const statementClass = classifyStatement(ctx, statement)
    if (statementClass === 'bad') return 'ask'
    // 'strict' (a return of trusted values, break/continue, …) never
    // widens the grammar: it exists in the strict class precisely to hand
    // back tool results, so it contributes no flag of its own.
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
 * (default) admits the widened grammar (pure expressions, recognized
 * control flow, whitelisted builtin methods).
 */
export function runCodeGateAllows(verdict: RunCodeGateVerdict, pureExpressions: boolean): boolean {
  if (verdict === 'tools-only') return true
  return pureExpressions && (verdict === 'tools-and-pure' || verdict === 'pure')
}

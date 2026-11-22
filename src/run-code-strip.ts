/**
 * The run_code evidence splitter: separate gated `tools.*` sub-calls from
 * the rest of a program before the smart classifier sees it.
 *
 * A `run_code` program mixes two kinds of code:
 *
 * - `tools.*` sub-calls, each of which re-enters the approval gate at
 *   execution time under its real tool name with its real argument values
 *   (ADR 0004) — the classifier reviewing the program is NOT their
 *   reviewer, and sub-call content distracts it into re-judging calls that
 *   have their own gate;
 * - everything else — imports, direct calls, data assembly — the direct
 *   effects only this classifier can judge.
 *
 * This module splits the program along that line: the classifier's
 * `command` carries only the direct code, with each stripped sub-call
 * replaced by a `[gated sub-call]` marker so the surrounding program shape
 * and data flow stay readable (`const r = [gated sub-call]` keeps `r` a
 * visible origin, unlike deleting the statement).
 *
 * The split is trustworthy only when every syntactic `tools.x(...)` call
 * really dispatches to the ambient sub-call binding. A program that could
 * divert it — a binding named `tools` (gate shadow rule), a bare `eval` /
 * `Function` reference, a dynamic `import()`, any member-target
 * assignment / update / delete (covers `globalThis.tools = …` and
 * `__proto__` writes), or the object-reflection hijack surfaces
 * (`Object.assign`, `Object.defineProperty`, `Reflect.set`, …) — is NOT
 * split: the classifier sees the raw program. Every abort fails safe:
 * not splitting only means the classifier sees more, never less.
 *
 * The splitter recognizes, it does not guess; it is a noise reducer, not
 * a security boundary — the hard boundary under PTC remains the sandbox
 * (ADR 0004). It never runs in request / auto-edit, whose top-level ask
 * shows the user the real program, and it never alters the danger-list
 * match text, the session-memory key, or the `[code: …]` preview: those
 * all keep the original source.
 */

import type { AcornNode } from './run-code-gate.js'
import {
  SUB_CALL_BINDING,
  collectDeclaredNames,
  isPlainIdentifier,
  parseProgramBody,
} from './run-code-gate.js'

// ─── Public result ──────────────────────────────────────────────────────────

/** What the splitter concluded about one program. */
export interface RunCodeStripResult {
  /** The text to hand the classifier: the split program, or the original
   *  program when the splitter aborted (or found nothing to strip). */
  readonly text: string
  /** How many outermost sub-calls were replaced by markers. */
  readonly stripped: number
  /** Why the program was NOT split; `undefined` when the split ran. */
  readonly aborted: RunCodeStripAbort | undefined
}

/** Conservative abort reasons. Each means "the split could be unsound, so
 * the classifier gets the raw program instead". */
export type RunCodeStripAbort =
  | 'unparseable'
  | 'shadow'
  | 'eval'
  | 'dynamic-import'
  | 'member-write'
  | 'hijack-call'
  | 'internal-error'

/** The marker replacing each stripped sub-call. */
export const GATED_SUBCALL_MARKER = '[gated sub-call]'

// ─── Abort vocabulary ────────────────────────────────────────────────────────

/** Identifier names that can divert a syntactic `tools.x(...)` when
 * evaluated: `eval` and the `Function` constructor compile arbitrary
 * strings. A bare reference anywhere aborts the split (conservative:
 * honest code does not use either). Member-property occurrences
 * (`foo.eval`) abort too — over-aborting is the safe direction. */
const EVAL_IDENTIFIER_NAMES = new Set(['eval', 'Function'])

/** Object / Reflect methods that can redirect the `tools` binding
 * (`Object.assign(globalThis, { tools })`, `Reflect.set(globalThis, …)`).
 * Everything else on those receivers (`Object.keys`, `Reflect.get`, …)
 * keeps the program splittable. */
const OBJECT_HIJACK_METHODS = new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'])
const REFLECT_HIJACK_METHODS = new Set(['set', 'defineProperty', 'deleteProperty'])

// ─── AST walk ────────────────────────────────────────────────────────────────

/** Generic full-tree walk over an acorn node: object fields holding nodes
 * and arrays holding nodes, in source order of the object's own fields.
 * The strip pass is position-based, so field order does not affect
 * correctness — only the collected ranges are. */
function walk(node: AcornNode, visit: (node: AcornNode) => void): void {
  visit(node)
  for (const value of Object.values(node)) {
    if (typeof value !== 'object' || value === null) continue
    if (typeof (value as AcornNode).type === 'string') {
      walk(value as AcornNode, visit)
    } else if (Array.isArray(value)) {
      for (const element of value) {
        if (typeof element !== 'object' || element === null) continue
        if (typeof (element as AcornNode).type === 'string') walk(element as AcornNode, visit)
      }
    }
  }
}

/** A plain, non-computed, non-optional `tools.<name>(…)` callee — the same
 *  shape the gate's `toolsCallClass` recognizes. Computed
 *  (`tools['bash']`), optional-chained (`tools?.bash`) and aliased
 *  (`t.bash` after `const t = tools`) calls are NOT matched: they stay
 *  visible to the classifier, which is the safe direction. */
function isPlainSubCallCallee(node: AcornNode): boolean {
  if (node.type !== 'MemberExpression' || node.computed === true || node.optional === true) return false
  const object = node.object as AcornNode | undefined
  const property = node.property as AcornNode | undefined
  return object !== undefined && isPlainIdentifier(object) && object.name === SUB_CALL_BINDING
    && property !== undefined && isPlainIdentifier(property)
}

// ─── The split ───────────────────────────────────────────────────────────────

/**
 * Split one `run_code` program: replace every plain `tools.x(…)` (or
 * `await tools.x(…)`) sub-call with `[gated sub-call]`, keeping the rest
 * of the source byte-identical.
 *
 * Deterministic and total: any doubt aborts to the original text, so a
 * call site can use `text` unconditionally.
 */
export function stripGatedSubcalls(program: string): RunCodeStripResult {
  try {
    const body = parseProgramBody(program)
    if (body === undefined) return { text: program, stripped: 0, aborted: 'unparseable' }

    // A binding named `tools` turns syntactic sub-calls into plain
    // unguarded calls; the split would hide code nobody else reviews.
    const declared = new Set<string>()
    for (const statement of body) collectDeclaredNames(statement, declared)
    if (declared.has(SUB_CALL_BINDING)) return { text: program, stripped: 0, aborted: 'shadow' }

    let abort: RunCodeStripAbort | undefined
    const ranges: Array<{ start: number; end: number }> = []
    const rangeOf = (node: AcornNode): { start: number; end: number } | undefined => {
      const start = node.start
      const end = node.end
      return typeof start === 'number' && typeof end === 'number' ? { start, end } : undefined
    }

    for (const statement of body) {
      walk(statement, (node) => {
        if (abort !== undefined) return
        switch (node.type) {
          case 'Identifier':
            if (EVAL_IDENTIFIER_NAMES.has((node as { name?: unknown }).name as string)) abort = 'eval'
            return
          case 'Import':
            // The callee of a dynamic `import('…')` (older acorn shapes).
            abort = 'dynamic-import'
            return
          case 'ImportExpression':
            // A dynamic `import('…')` as its own node type (acorn ≥ 8.8,
            // including as the argument of `await import('…')`).
            abort = 'dynamic-import'
            return
          case 'AssignmentExpression': {
            const left = node.left as AcornNode | undefined
            if (left !== undefined && left.type === 'MemberExpression') abort = 'member-write'
            return
          }
          case 'UpdateExpression': {
            const argument = node.argument as AcornNode | undefined
            if (argument !== undefined && argument.type === 'MemberExpression') abort = 'member-write'
            return
          }
          case 'UnaryExpression': {
            if (node.operator === 'delete') {
              const argument = node.argument as AcornNode | undefined
              if (argument !== undefined && argument.type === 'MemberExpression') abort = 'member-write'
            }
            return
          }
          case 'AwaitExpression': {
            // `await tools.x(…)` — strip the whole await so the marker
            // lands in the receiving position (`const r = [marker]`).
            const argument = node.argument as AcornNode | undefined
            if (argument === undefined || argument.type !== 'CallExpression') return
            const callee = argument.callee as AcornNode | undefined
            if (callee !== undefined && isPlainSubCallCallee(callee)) {
              const range = rangeOf(node)
              if (range !== undefined) ranges.push(range)
            }
            return
          }
          case 'CallExpression': {
            const callee = node.callee as AcornNode | undefined
            if (callee === undefined) return
            if (callee.type === 'MemberExpression' && callee.computed !== true) {
              const object = callee.object as AcornNode | undefined
              const property = callee.property as AcornNode | undefined
              if (object !== undefined && isPlainIdentifier(object) && property !== undefined
                && isPlainIdentifier(property)) {
                if (object.name === 'Object' && OBJECT_HIJACK_METHODS.has(property.name)) {
                  abort = 'hijack-call'
                  return
                }
                if (object.name === 'Reflect' && REFLECT_HIJACK_METHODS.has(property.name)) {
                  abort = 'hijack-call'
                  return
                }
              }
            }
            if (isPlainSubCallCallee(callee)) {
              const range = rangeOf(node)
              if (range !== undefined) ranges.push(range)
            }
            return
          }
          default:
            return
        }
      })
      if (abort !== undefined) break
    }
    if (abort !== undefined) return { text: program, stripped: 0, aborted: abort }

    // Keep only outermost matches — a sub-call nested inside another
    // (`tools.write({ content: tools.read(…) })`) disappears with its
    // wrapper, so its inner range must not be double-counted or spliced.
    const outermost = ranges.filter((range) => !ranges.some((other) => other !== range
      && other.start <= range.start && range.end <= other.end))
    if (outermost.length === 0) return { text: program, stripped: 0, aborted: undefined }

    // Splice from the highest offset down so earlier ranges stay valid.
    let text = program
    for (const range of [...outermost].sort((a, b) => b.start - a.start)) {
      text = text.slice(0, range.start) + GATED_SUBCALL_MARKER + text.slice(range.end)
    }
    return { text, stripped: outermost.length, aborted: undefined }
  } catch {
    // The splitter must never break the approval pipeline: unreadable
    // input is handed to the classifier un-split.
    return { text: program, stripped: 0, aborted: 'internal-error' }
  }
}

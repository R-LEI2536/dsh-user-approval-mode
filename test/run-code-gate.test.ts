/**
 * Unit tests for the run_code code-structure gate (`src/run-code-gate.ts`).
 *
 * The gate is a syntax recognizer, not a danger list: a strict grammar
 * (tools.* calls, result variables, returns of trusted values) plus a
 * widened one (pure expressions, recognized control flow, a written-down
 * builtin-method whitelist whose callbacks are checked the same way).
 * These tests pin the written-down boundary (design page
 * docs/2026-11-07-run-code-approval-flow.html §classes, widened per the
 * `runCodePureExpressions` switch): reading results is part of a tool
 * call; call-free computation and recognized control flow are pure; a
 * gated call inside a loop or callback stays a gated call; branching out
 * of the grammar, imports, dynamic member access, shadowing the `tools`
 * binding, and anything unrecognized ask.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  runCodeGateAllows,
  runCodeGateVerdict,
  runCodeProgramFromArguments,
  runCodePreview,
  RUN_CODE_PREVIEW_MAX_CHARS,
  type RunCodeGateVerdict,
} from '../src/run-code-gate.ts'

test('run-code-gate: strict-grammar programs classify as tools-only', () => {
  const programs = [
    // A bare awaited call.
    "await tools.read({ file_path: 'README.md' })",
    // A bare unawaited call.
    "tools.read({ file_path: 'README.md' })",
    // Receive the result, then read it in the return.
    "const r = await tools.read({ file_path: 'README.md' })\nreturn r.lines.length",
    // Multiple declarators in one statement.
    "const a = await tools.read({ file_path: 'a' }), b = await tools.read({ file_path: 'b' })\nreturn a",
    // Nested object/array literals of primitives and identifiers.
    "await tools.write({ file_path: 'x', content: 'y', tags: ['a', 'b'], meta: { n: 1, src: a } })",
    // Member chains of a received result as a call argument.
    "await tools.write({ file_path: r.meta.path, content: r.body.text })",
    // return of a plain literal / object of literals / nothing at all.
    "return 42",
    "await tools.read({ file_path: 'a' })\nreturn { ok: true, n: 1 }",
    "await tools.read({ file_path: 'a' })\nreturn",
    // An empty program does nothing.
    '',
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'tools-only', `must be tools-only: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: call-free pure computation classifies as pure', () => {
  const programs = [
    // The design page's original noise complaint: pure arithmetic.
    'const x = 1 + 1; return x',
    'return 1 + 1',
    // Comparisons and conditionals over the program's own data.
    'const n = r.lines.length > 100\nreturn n',
    // Template assembly over a received result.
    'const t = `count: ${r.lines.length}`\nreturn t',
    // Literal-index member reads on results.
    'return r.body[0].text',
    // Spreads and pure object building.
    'const merged = { ...r.meta, extra: 1 }\nreturn merged',
    'return [...r.items, "tail"]',
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'pure', `must be pure: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: recognized control flow and builtin methods classify as pure', () => {
  const programs = [
    // The shapes the devweb test agent hit — for-of over a declared array.
    "const patterns = ['a', 'b']\nfor (const p of patterns) { await tools.grep({ pattern: p }) }\nreturn 'done'",
    // Classic for with a local counter (local assignment is pure).
    'let total = 0\nfor (let i = 0; i < 10; i += 1) { total = total + i }\nreturn total',
    // while with a declared counter; break/continue ride along.
    'let n = 0\nwhile (n < 3) { if (n === 1) { n = n + 1; continue } n = n + 1 }\nreturn n',
    // if / else over a pure condition.
    "const r = await tools.read({ file_path: 'a' })\nif (r.lines.length > 10) { return 'big' }\nreturn r.lines.length",
    // switch over a declared value.
    "const kind = 'a'\nswitch (kind) { case 'a': return 1; default: return 0 }",
    // try/catch around a gated call; the catch parameter is declared.
    "try { await tools.read({ file_path: 'a' }) } catch (e) { return 'missing' }",
    // Whitelisted builtin methods on pure receivers.
    'const names = Object.keys({ a: 1, b: 2 }).sort()\nreturn names',
    "const r = await tools.read({ file_path: 'a' })\nreturn r.entries.slice(0, 20).map(x => x.title)",
    'return Math.max(1, 2) + JSON.parse(\'{"n":1}\').n',
    'return Number("3") + parseInt("4", 10)',
    // Mutating members on the program's own data are still pure.
    'const out = []\nout.push(1)\nout.push(2)\nreturn out.sort()',
    // Nested callbacks: the inner callback is checked the same way.
    'return list.map(x => x.items.map(y => y.name)).flat()',
    // Assignment to a callback parameter (params are declared).
    'return list.map(x => { x = x + 1; return x })',
    // A gated sub-call inside a callback stays a gated sub-call.
    "items.map(async x => { await tools.read({ file_path: x }) })",
  ]
  for (const program of programs) {
    const verdict = runCodeGateVerdict(program)
    assert.ok(verdict === 'pure' || verdict === 'tools-and-pure', `must pass the widened grammar: ${verdict} <- ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: a loop body is checked — hidden effects still ask', () => {
  const programs = [
    // rmSync hiding in a loop body: the loop is recognized, the body is not.
    "for (const p of list) { rmSync('./x') }",
    // Hidden in a callback body — the trap the whitelist closes.
    "list.map(x => { rmSync('./x') })",
    "list.sort((a, b) => rmSync('./x'))",
    // Hidden behind a conditional that itself fails the grammar.
    "if (rmSync('./x')) { return 1 }",
    // A tools sub-call in a try whose catch destructures: grammar fail.
    "try { await tools.read({ file_path: 'a' }) } catch ({ code }) { return code }",
    // Non-computed but unrecognized method.
    "r.entries.toString()",
    // throw of a NewExpression: `new` stays outside the grammar.
    "throw new Error('boom')",
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'ask', `must ask: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: shadowing the tools binding asks, and assignment is local-only', () => {
  const programs = [
    // A variable that shadows the sub-call binding.
    'const tools = { read: () => 1 }\nreturn tools.read()',
    // A callback parameter that shadows it.
    'list.map(tools => tools.write({}))',
    // A catch parameter that shadows it.
    'try { return 1 } catch (tools) { return 0 }',
    // Assignment to an undeclared name.
    'x = 1\nreturn x',
    // Assignment to a member (only plain declared identifiers may be assigned).
    'r.x = 1\nreturn r',
    // Update on a member.
    'r.count++\nreturn r',
    // for-of binding that destructures.
    'for (const { a } of list) { return a }',
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'ask', `must ask: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: anything else asks', () => {
  const programs = [
    // Direct imports and direct API calls.
    "import { rmSync } from 'node:fs'\nrmSync('./dist', { recursive: true })",
    "const fs = require('node:fs')",
    // Dynamic member access — computed with a non-literal key, or on an
    // ambient global.
    "const f = globalThis['fe' + 'tch']\nawait f('https://example.com')",
    'return r.body[i].text',
    // Ambient globals even as bare argument values or returns.
    'await tools.write({ file_path: process.argv[1] })',
    'return globalThis',
    // Assignment to a variable (top-level reassignment is fine ONLY for
    // declared names — this one never declares it).
    // Destructuring a result.
    "const { lines } = await tools.read({ file_path: 'a' })",
    // Chaining a method off a tool call.
    "await tools.read({ file_path: 'a' }).then((r) => r)",
    // Function declarations, classes, await of a non-call, and stray
    // arrows (a function stored in a variable is not a pure value).
    'function helper() { return 1 }',
    'class Thing {}',
    'await 5',
    'const run = async () => { await tools.read({}) }\nreturn run',
    // A call on anything but the `tools` binding, awaited or not.
    "console.log('side effect')",
    "await fetch('https://example.com')",
    "eval('rmSync(\"./x\")')",
    // A generator function passed as a callback.
    'list.map(function* () { return 1 })',
    // Unparseable source fails closed.
    'const const',
    '})',
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'ask', `must ask: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: an infinite loop still passes the grammar (the run budget bounds it)', () => {
  // `while (true) {}` is recognized control flow; the run_code budget
  // (default 120 s) is the backstop, not the parser.
  assert.equal(runCodeGateVerdict('while (true) { x = x + 1 }'), 'ask', 'x is not declared here')
  assert.equal(runCodeGateVerdict('let x = 0\nwhile (true) { x = x + 1 }\nreturn x'), 'pure')
})

test('run-code-gate: runCodeGateAllows honors the width switch', () => {
  const on = true
  const off = false
  assert.equal(runCodeGateAllows('tools-only', on), true)
  assert.equal(runCodeGateAllows('tools-only', off), true, 'the strict grammar is always allowed')
  assert.equal(runCodeGateAllows('tools-and-pure', on), true)
  assert.equal(runCodeGateAllows('tools-and-pure', off), false)
  assert.equal(runCodeGateAllows('pure', on), true)
  assert.equal(runCodeGateAllows('pure', off), false)
  assert.equal(runCodeGateAllows('ask', on), false)
  assert.equal(runCodeGateAllows('ask', off), false)
})

test('run-code-gate: the verdict type stays closed over the four values', () => {
  const verdicts: readonly RunCodeGateVerdict[] = ['tools-only', 'tools-and-pure', 'pure', 'ask']
  assert.deepEqual([...verdicts].sort(), ['ask', 'pure', 'tools-and-pure', 'tools-only'])
})

test('run-code-gate: runCodeProgramFromArguments reads only a string code field', () => {
  assert.equal(runCodeProgramFromArguments({ code: 'return 1' }), 'return 1')
  assert.equal(runCodeProgramFromArguments({ code: '' }), '')
  assert.equal(runCodeProgramFromArguments({ description: 'no code' }), undefined)
  assert.equal(runCodeProgramFromArguments({ code: 42 }), undefined)
  assert.equal(runCodeProgramFromArguments('not an object'), undefined)
  assert.equal(runCodeProgramFromArguments(null), undefined)
  assert.equal(runCodeProgramFromArguments(undefined), undefined)
})

test('run-code-gate: the preview collapses whitespace and caps at the limit', () => {
  assert.equal(runCodePreview('await tools.read({\n  file_path: "a"\n})'), 'await tools.read({ file_path: "a" })')
  assert.equal(runCodePreview('   '), '(empty program)')
  const capped = runCodePreview(`rmSync('${'a'.repeat(400)}')`)
  assert.ok(capped.length <= RUN_CODE_PREVIEW_MAX_CHARS + 1, 'at most the cap plus the ellipsis')
  assert.ok(capped.endsWith('…'), 'the cap is visible in the preview')
})

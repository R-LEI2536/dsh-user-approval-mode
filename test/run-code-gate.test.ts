/**
 * Unit tests for the run_code code-structure gate (`src/run-code-gate.ts`).
 *
 * The gate is a syntax recognizer, not a danger list: a strict grammar
 * (tools.* calls, result variables, returns of trusted values) plus a
 * widened one (call-free pure expressions). These tests pin the
 * written-down boundary (design page
 * docs/2026-11-07-run-code-approval-flow.html §classes, widened per the
 * `runCodePureExpressions` switch): reading results is part of a tool
 * call; call-free computation is pure; branching, imports, dynamic member
 * access, and anything unrecognized ask.
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

test('run-code-gate: pure statements alongside tools calls classify as tools-and-pure', () => {
  const programs = [
    'const n = 1 + 1\nawait tools.write({ content: "x" })\nreturn n',
    // A tools call whose arguments use the widened expression class.
    "await tools.bash({ command: 'echo ' + n })",
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'tools-and-pure', `must be tools-and-pure: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: anything else asks', () => {
  const programs = [
    // Branching.
    "const r = await tools.read({ file_path: 'a' })\nif (r.lines.length > 100) { await tools.write({ file_path: 'b', content: 'x' }) }",
    // A loop.
    'for (let i = 0; i < 3; i += 1) { await tools.read({}) }',
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
    // Assignment to a variable (only declarations may receive results).
    "r = await tools.read({ file_path: 'a' })",
    // A declaration with no initializer.
    'const r',
    // Destructuring a result.
    "const { lines } = await tools.read({ file_path: 'a' })",
    // Chaining a method off a tool call.
    "await tools.read({ file_path: 'a' }).then((r) => r)",
    // Function declarations, classes, try/catch, await of a non-call.
    'function helper() { return 1 }',
    'class Thing {}',
    'try { await tools.read({}) } catch { }',
    'await 5',
    // A call on anything but the `tools` binding, awaited or not.
    "console.log('side effect')",
    "await fetch('https://example.com')",
    // Unparseable source fails closed.
    'const const',
    '})',
  ]
  for (const program of programs) {
    assert.equal(runCodeGateVerdict(program), 'ask', `must ask: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: a sub-call-shaped tools key is irrelevant here (top-level only)', () => {
  // The gate classifies top-level programs; `tools` inside a nested function
  // is NOT a top-level statement, so a program hiding calls in a function
  // asks.
  assert.equal(runCodeGateVerdict('const run = async () => { await tools.read({}) }\nreturn run'), 'ask')
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

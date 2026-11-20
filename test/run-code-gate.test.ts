/**
 * Unit tests for the run_code code-structure gate (`src/run-code-gate.ts`).
 *
 * The whitelist is a syntax recognizer, not a danger list: every statement
 * must be a `tools.*` call, a variable receiving one, or a `return` of
 * trusted values. These tests pin the written-down boundary (design page
 * docs/2026-11-07-run-code-approval-flow.html §classes): reading results
 * is part of a tool call; arithmetic, branching, imports, dynamic member
 * access, and anything unrecognized ask.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isToolCallsOnly,
  runCodeProgramFromArguments,
  runCodePreview,
  RUN_CODE_PREVIEW_MAX_CHARS,
} from '../src/run-code-gate.ts'

test('run-code-gate: tools-only programs are allowed', () => {
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
    // Member chains of a received result as a call argument (non-computed only:
    // a literal-index access `r.body[0]` is a computed member and asks below).
    "await tools.write({ file_path: r.meta.path, content: r.body.text })",
    // return of a plain literal / object of literals / nothing at all.
    "return 42",
    "await tools.read({ file_path: 'a' })\nreturn { ok: true, n: 1 }",
    "await tools.read({ file_path: 'a' })\nreturn",
    // An empty program does nothing.
    '',
  ]
  for (const program of programs) {
    assert.equal(isToolCallsOnly(program), true, `must allow: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: any other JS asks', () => {
  const programs = [
    // Pure computation with no side effect still asks (written-down boundary).
    'const x = 1; return x + 1',
    // Branching.
    "const r = await tools.read({ file_path: 'a' })\nif (r.lines.length > 100) { await tools.write({ file_path: 'b', content: 'x' }) }",
    // A loop.
    'for (let i = 0; i < 3; i += 1) { await tools.read({}) }',
    // Direct imports and direct API calls.
    "import { rmSync } from 'node:fs'\nrmSync('./dist', { recursive: true })",
    "const fs = require('node:fs')",
    // Dynamic member access — including a literal index on a result read:
    // the boundary is "computed member", written down as strict.
    "const f = globalThis['fe' + 'tch']\nawait f('https://example.com')",
    "return r.body[0].text",
    // Template-literal assembly in a return.
    'return `prefix-${name}`',
    // Ambient globals even as bare argument values.
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
    // Function declarations, classes, spread, try/catch, generators.
    'function helper() { return 1 }',
    'class Thing {}',
    "await tools.write({ ...base, content: 'x' })",
    'try { await tools.read({}) } catch { }',
    // A call on anything but the `tools` binding, awaited or not.
    "console.log('side effect')",
    "await fetch('https://example.com')",
    // Unparseable source fails closed.
    'const const',
    '})',
  ]
  for (const program of programs) {
    assert.equal(isToolCallsOnly(program), false, `must ask: ${program.slice(0, 60)}`)
  }
})

test('run-code-gate: a sub-call-shaped tools key is irrelevant here (top-level only)', () => {
  // The gate classifies top-level programs; `tools` inside a nested function
  // body is NOT a top-level statement, so a program hiding calls in a
  // function asks.
  assert.equal(isToolCallsOnly('const run = async () => { await tools.read({}) }\nreturn run'), false)
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

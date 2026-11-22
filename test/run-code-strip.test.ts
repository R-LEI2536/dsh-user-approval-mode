/**
 * Unit tests for the run_code evidence splitter.
 *
 * Every test pins one boundary of the split: what gets replaced, what
 * stays byte-identical, and — the load-bearing half — every abort
 * condition that keeps the classifier on the raw program. The direction
 * of failure is asymmetric and the tests encode it: a miss (something
 * left visible) is harmless, a wrong strip is not, so every doubtful
 * shape must abort, never guess.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { GATED_SUBCALL_MARKER, stripGatedSubcalls } from '../src/run-code-strip.ts'

test('strip: a plain sub-call is replaced by the marker, the rest untouched', () => {
  const program = "const r = await tools.read({ path: 'a.txt' })\nsendOut(r)"
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 1)
  assert.equal(result.text, `const r = ${GATED_SUBCALL_MARKER}\nsendOut(r)`)
})

test('strip: a bare (non-awaited) sub-call is replaced too', () => {
  const program = "tools.bash({ command: 'ls' })\nrmSync('./dist')"
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 1)
  assert.equal(result.text, `${GATED_SUBCALL_MARKER}\nrmSync('./dist')`)
})

test('strip: a sub-call nested inside another counts once (outermost wins)', () => {
  const program = 'await tools.write({ content: await tools.read({ path: "x" }) })'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 1)
  // The await node's range covers the `await` keyword itself, so the
  // marker replaces the whole expression.
  assert.equal(result.text, GATED_SUBCALL_MARKER)
})

test('strip: computed and optional-chained calls stay visible (safe direction)', () => {
  const program = "tools['bash']({ command: 'ls' })\ntools?.bash({ command: 'ls' })"
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 0)
  assert.equal(result.text, program)
})

test('strip: an aliased call stays visible (safe direction)', () => {
  const program = 'const t = tools\nt.bash({ command: "ls" })'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 0)
  assert.equal(result.text, program)
})

test('strip: a program with no sub-calls comes back unchanged', () => {
  const program = "rmSync('./dist')"
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 0)
  assert.equal(result.text, program)
})

test('strip: pure code around a sub-call survives (Object.keys is not a hijack)', () => {
  const program = 'const r = await tools.read({ p: "a" })\nreturn Object.keys(r).sort()'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 1)
  assert.equal(result.text, `const r = ${GATED_SUBCALL_MARKER}\nreturn Object.keys(r).sort()`)
})

// ─── Abort conditions: every doubtful shape hands back the raw program ──────

test('strip: a binding named tools aborts (shadow)', () => {
  const program = 'const tools = {}\ntools.bash({ command: "ls" })'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, 'shadow')
  assert.equal(result.stripped, 0)
  assert.equal(result.text, program)
})

test('strip: a callback parameter named tools aborts (shadow)', () => {
  const program = 'list.map(tools => tools.bash({}))'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, 'shadow')
  assert.equal(result.text, program)
})

test('strip: eval and Function references abort', () => {
  for (const program of ["eval('tools = fake')", "new Function('return 1')", 'const f = Function']) {
    const result = stripGatedSubcalls(program)
    assert.equal(result.aborted, 'eval', program)
    assert.equal(result.text, program)
  }
})

test('strip: a dynamic import aborts', () => {
  const result = stripGatedSubcalls("const fs = await import('node:fs')")
  assert.equal(result.aborted, 'dynamic-import')
  assert.equal(result.text, "const fs = await import('node:fs')")
})

test('strip: any member-target write aborts (covers globalThis.tools)', () => {
  const program = 'globalThis.tools = { bash: (a) => 1 }\ntools.bash({})'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, 'member-write')
  assert.equal(result.text, program)
})

test('strip: computed member writes abort too', () => {
  const result = stripGatedSubcalls("globalThis['tools'] = {}")
  assert.equal(result.aborted, 'member-write')
})

test('strip: Object / Reflect hijack surfaces abort, benign members do not', () => {
  for (const program of [
    'Object.assign(globalThis, {})',
    'Object.defineProperty(globalThis, "tools", {})',
    'Reflect.set(globalThis, "tools", {})',
    'Reflect.deleteProperty(globalThis, "tools")',
  ]) {
    const result = stripGatedSubcalls(program)
    assert.equal(result.aborted, 'hijack-call', program)
    assert.equal(result.text, program)
  }
  assert.equal(stripGatedSubcalls('Object.keys(globalThis)').aborted, undefined)
})

test('strip: unparseable source aborts un-split', () => {
  const program = 'const const'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, 'unparseable')
  assert.equal(result.text, program)
})

test('strip: markers land inside template literals and object positions', () => {
  const program = 'const m = `x${await tools.read({ path: "a" })}y`\nreturn m'
  const result = stripGatedSubcalls(program)
  assert.equal(result.aborted, undefined)
  assert.equal(result.stripped, 1)
  assert.equal(result.text, `const m = \`x\${${GATED_SUBCALL_MARKER}}y\`\nreturn m`)
})

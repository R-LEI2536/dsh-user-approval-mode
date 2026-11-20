/**
 * Gate-level tests for the PTC agent preset.
 *
 * Under the `ptc` preset the model can call only `run_code`; the program's
 * `tools.*` sub-calls re-enter the SAME `tools/pre-execute` waterfall under
 * their real tool names, carrying `parent` / `rootCallId` / a `:ptc:<n>`
 * call id. The host rejects a model-direct native call BEFORE the policy
 * pipeline, so the gate never sees one. These tests pin that contract as the
 * plugin implements it:
 *
 * - `run_code` is transport, classified by its program's code structure:
 *   a tools-only program is allowed in every mode (with a greppable gate
 *   log); the widened grammar — pure expressions, recognized control
 *   flow, whitelisted builtin methods with checked callbacks — is allowed
 *   per the `runCodePureExpressions` switch; anything else asks in
 *   request/auto-edit (with a `[code: …]` summary) and rides the smart
 *   five-step pipeline in smart mode (the grammar being a fast-allow
 *   inside it, after the danger list);
 * - sub-calls are classified by family exactly like native calls;
 * - a PTC sub-call's ask reason carries an argument summary because the host
 *   approval dialog cannot show a nested call's arguments;
 * - the default ask copy ships bilingual: en is the logged reason, zh rides
 *   the host displayReason channel for zh UIs; a custom template stays verbatim;
 * - removing `run_code` from `autoAllowTools` restores the per-program prompt.
 *
 * The harness mirrors `test/gate-read-only-git.test.ts`: the REAL gate is
 * driven with a minimal fake Context, defaults come from the real `Config`
 * schema, and `next()` reports the downstream `allow` a plain host would.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  apply,
  Config,
  setApprovalMode,
  type ApprovalMode,
  type Config as ApprovalConfig,
} from '../src/index.ts'

interface Decision {
  readonly kind: string
  readonly reason?: string
  readonly displayReason?: { readonly en: string; readonly zh: string }
}
interface PtcExecution {
  name: string
  arguments: unknown
  agent?: unknown
  parent?: unknown
  callId?: string
  rootCallId?: string
}
type PreExecute = (exec: PtcExecution, next: () => Promise<Decision>) => Promise<Decision>

interface Gate {
  decide: (exec: Omit<PtcExecution, 'agent'>) => Promise<Decision>
  logs: string[]
}

let gateCounter = 0

function makeGate(mode: ApprovalMode, configOverrides: ApprovalConfig = {}): Gate {
  // A distinct session object per gate keeps the plugin's WeakMap-backed mode
  // storage from leaking between tests.
  gateCounter += 1
  const session = { id: `ptc-session-${gateCounter}`, header: { cwd: '/tmp' } }
  setApprovalMode(session as never, mode)

  let handler: PreExecute | undefined
  const logs: string[] = []
  const ctx = {
    inject: () => { /* no settings / commands service in this fake host */ },
    get: () => undefined,
    effect: () => { /* no teardown needed */ },
    on: (name: string, fn: PreExecute) => { if (name === 'tools/pre-execute') handler = fn },
    logger: { info: (line: string) => { logs.push(line) } },
    fiber: {},
  }
  apply(ctx as never, Config(configOverrides))

  return {
    logs,
    decide: (exec) => {
      assert.ok(handler !== undefined, 'the gate must register tools/pre-execute')
      return handler({ ...exec, agent: { session } }, async () => ({ kind: 'allow' }))
    },
  }
}

/** A `run_code` top-level call (no parent). Default code is a tools-only
 * program: the shape the transport contract allows through. */
const runCode = (code = "const r = await tools.read({ file_path: 'README.md' })\nreturn r.lines.length") => ({
  name: 'run_code',
  arguments: { code, description: 'any program' },
})

/** A `tools.*` dispatch inside a `run_code` program. */
const subCall = (name: string, args: unknown, n = 1) => ({
  name,
  arguments: args,
  parent: {},
  callId: `call-1:ptc:${n}`,
  rootCallId: 'call-1',
})

test('ptc: a tools-only program is allowed as transport in every mode, with a gate log', async () => {
  // request / auto-edit / smart all allow the program, each leaving one
  // greppable allow line; yolo / off allow without inspecting or logging.
  for (const mode of ['request', 'auto-edit', 'smart'] as const) {
    const gate = makeGate(mode)
    assert.deepEqual(await gate.decide(runCode()), { kind: 'allow' }, `mode=${mode}`)
    assert.deepEqual(gate.logs, [`[dsh-user-approval[run-code-gate]] decision=allow detail=tools-only`], `mode=${mode} logs the gate allow`)
  }
  for (const mode of ['yolo', 'off'] as const) {
    const gate = makeGate(mode)
    assert.deepEqual(await gate.decide(runCode()), { kind: 'allow' }, `mode=${mode}`)
    assert.deepEqual(gate.logs, [], `mode=${mode} must not log a decision for the transport`)
  }
})

test('ptc: a pure program is allowed in every mode via the width switch', async () => {
  for (const mode of ['request', 'auto-edit', 'smart'] as const) {
    const gate = makeGate(mode)
    assert.deepEqual(await gate.decide(runCode('const x = 1 + 1\nreturn x')), { kind: 'allow' }, `mode=${mode}`)
    assert.deepEqual(gate.logs, [`[dsh-user-approval[run-code-gate]] decision=allow detail=pure`], `mode=${mode} logs the gate allow`)
  }
  for (const mode of ['yolo', 'off'] as const) {
    const gate = makeGate(mode)
    assert.deepEqual(await gate.decide(runCode('const x = 1 + 1\nreturn x')), { kind: 'allow' }, `mode=${mode}`)
    assert.deepEqual(gate.logs, [], `mode=${mode} must not log a decision`)
  }
})

test('ptc: turning the width switch off restores the strict grammar', async () => {
  for (const mode of ['request', 'auto-edit'] as const) {
    const gate = makeGate(mode, { runCodePureExpressions: false })
    // A pure program asks again…
    const pure = await gate.decide(runCode('const x = 1 + 1\nreturn x'))
    assert.equal(pure.kind, 'ask', `mode=${mode}`)
    assert.match(pure.reason ?? '', /\[code: const x = 1 \+ 1 return x\]/)
    // …and a strict tools-only program still passes.
    const toolsOnly = await gate.decide(runCode())
    assert.equal(toolsOnly.kind, 'allow', `mode=${mode}`)
    assert.deepEqual(gate.logs, [`[dsh-user-approval[run-code-gate]] decision=allow detail=tools-only`])
  }
  // Smart: the widened grammar is closed, so the pure program falls
  // through to the (missing) LLM seam and fails safe; tools-only still
  // fast-allows. A recognized loop is closed too — the strict grammar
  // knows no control flow.
  const smart = makeGate('smart', { runCodePureExpressions: false })
  const pureSmart = await smart.decide(runCode('const x = 1 + 1\nreturn x'))
  assert.equal(pureSmart.kind, 'ask')
  assert.match(pureSmart.reason ?? '', /\[smart: llm-unavailable\]/)
  const loopSmart = await smart.decide(runCode("const a = ['x']\nfor (const p of a) { await tools.grep({ pattern: p }) }"))
  assert.equal(loopSmart.kind, 'ask')
  assert.match(loopSmart.reason ?? '', /\[smart: llm-unavailable\]/)
  const toolsOnlySmart = await smart.decide(runCode())
  assert.deepEqual(toolsOnlySmart, { kind: 'allow' })
  assert.deepEqual(smart.logs, [
    '[dsh-user-approval[smart]] decision=ask detail=llm-unavailable',
    '[dsh-user-approval[smart]] decision=ask detail=llm-unavailable',
    '[dsh-user-approval[run-code-gate]] decision=allow detail=tools-only',
  ])
})

test('ptc: request and auto-edit ask for a program outside both grammars', async () => {
  for (const mode of ['request', 'auto-edit'] as const) {
    const gate = makeGate(mode)
    const decision = await gate.decide(runCode("rmSync('./dist', { recursive: true })"))
    assert.equal(decision.kind, 'ask', `mode=${mode}`)
    assert.equal(decision.reason, `[other] Tool: run_code | Mode: ${mode} [code: rmSync('./dist', { recursive: true })]`)
  }
})

test('ptc: yolo and off allow a pure-JS program without logging', async () => {
  for (const mode of ['yolo', 'off'] as const) {
    const gate = makeGate(mode)
    assert.deepEqual(await gate.decide(runCode("rmSync('./dist', { recursive: true })")), { kind: 'allow' }, `mode=${mode}`)
    assert.deepEqual(gate.logs, [], `mode=${mode} must not log a decision`)
  }
})

test('ptc: a recognized loop program passes the top level; its gated sub-call still asks', async () => {
  // The devweb test agent's shape: a for-of over a declared array with a
  // gated read inside. The top level is recognized (tools-and-pure) and
  // allows; the loop body's gated sub-call still passes the family gate.
  const gate = makeGate('request')
  const program = [
    "const patterns = ['big', 'small']",
    'for (const p of patterns) {',
    "  await tools.grep({ pattern: p })",
    '}',
    "return 'done'",
  ].join('\n')
  const top = await gate.decide(runCode(program))
  assert.deepEqual(top, { kind: 'allow' })
  assert.deepEqual(gate.logs, ['[dsh-user-approval[run-code-gate]] decision=allow detail=tools-and-pure'])
  const inner = await gate.decide(subCall('grep', { pattern: 'big' }))
  assert.deepEqual(inner, { kind: 'allow' }, 'grep is a read-only sub-call')
})

test('ptc: a mixed program asks, and its write sub-call asks again (double prompt)', async () => {
  // The program leaves the grammar entirely (console.log is an
  // unrecognized call), so the top level asks; after that approval the
  // write sub-call passes the family gate and asks again.
  const gate = makeGate('request')
  const program = [
    "console.log('starting')",
    "await tools.write({ file_path: 'big.txt', content: 'big' })",
  ].join('\n')
  const top = await gate.decide(runCode(program))
  assert.equal(top.kind, 'ask')
  assert.match(top.reason ?? '', /\[other\] Tool: run_code \| Mode: request/)
  assert.match(top.reason ?? '', /\[code: console\.log\('starting'\) await tools\.write\(\{ file_path: 'big\.txt', content: 'big' \}\)\]/)
  // The double prompt: the program's own write sub-call still passes the
  // family gate after the top-level ask.
  const inner = await gate.decide(subCall('write', { path: 'big.txt', content: 'big' }))
  assert.equal(inner.kind, 'ask')
  assert.match(inner.reason ?? '', /\[args: big\.txt\]/)
})

test('ptc: a pure-JS program with a direct import asks', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(runCode("import { rmSync } from 'node:fs'\nrmSync('./dist', { recursive: true })"))
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /\[code: import \{ rmSync \} from 'node:fs' rmSync\('\.\/dist', \{ recursive: true \}\)\]/)
})

test('ptc: dynamic member access falls off the whitelist and asks', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(runCode("const f = globalThis['fe' + 'tch']\nawait f('https://example.com')"))
  assert.equal(decision.kind, 'ask')
})

test('ptc: an unparseable program asks (fail closed)', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(runCode('const const'))
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /\[code: const const\]/)
})

test('ptc: a program without readable code asks without a code suffix', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide({ name: 'run_code', arguments: { description: 'no code field' } })
  assert.equal(decision.kind, 'ask')
  assert.equal(decision.reason, '[other] Tool: run_code | Mode: request')
  assert.ok(!(decision.reason ?? '').includes('[code:'), 'no readable code means no preview')
  assert.ok(!(decision.reason ?? '').includes('[args:'), 'a top-level call is not a PTC sub-call')
})

test('ptc: a long program summary is capped with an ellipsis', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(runCode(`rmSync('${'a'.repeat(400)}')`))
  assert.equal(decision.kind, 'ask')
  assert.ok((decision.reason ?? '').endsWith('…]'), 'the preview must end with the capped marker')
  const preview = /\[code: (.*)\]$/u.exec(decision.reason ?? '')?.[1]
  assert.ok(preview !== undefined && preview.length <= 201, `preview too long: ${preview?.length}`)
})

test('ptc: the top-level ask copy ships bilingual through displayReason', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(runCode("rmSync('./dist', { recursive: true })"))
  assert.equal(decision.kind, 'ask')
  assert.deepEqual(decision.displayReason, {
    en: "[other] Tool: run_code | Mode: request [code: rmSync('./dist', { recursive: true })]",
    zh: "[other] 工具: run_code | 模式: request [code: rmSync('./dist', { recursive: true })]",
  })
})

test('ptc: smart routes the program through the five-step pipeline with the code as command', async () => {
  // 1. The danger list hits before any LLM call: the program text is the command.
  const dangerGate = makeGate('smart', { smartExtraDangerPatterns: ['rmSync'] })
  const dangerous = await dangerGate.decide(runCode("rmSync('./dist', { recursive: true })"))
  assert.equal(dangerous.kind, 'ask')
  assert.match(dangerous.reason ?? '', /\[smart: pattern=rmSync\]/)
  assert.match(dangerous.reason ?? '', /\[code: rmSync\('\.\/dist', \{ recursive: true \}\)\]/)

  // 2. A benign program reaches the missing LLM seam and falls back to manual review.
  const gate = makeGate('smart')
  const benign = await gate.decide(runCode("console.log('no tools, no danger')"))
  assert.equal(benign.kind, 'ask')
  assert.match(benign.reason ?? '', /\[smart: llm-unavailable\]/)
  assert.match(benign.reason ?? '', /\[code: console\.log\('no tools, no danger'\)\]/)
})

test('ptc: request mode asks for a write sub-call and shows its path', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(subCall('write', { path: 'src/a.ts', content: 'x' }))
  assert.equal(decision.kind, 'ask')
  assert.equal(decision.reason, '[edit] Tool: write | Mode: request [args: src/a.ts]')
  assert.match(decision.reason ?? '', /\[args: src\/a\.ts\]/)
})

test('ptc: request mode asks for a bash sub-call and shows one-line command', async () => {
  const gate = makeGate('request')
  // An all-`echo` chain is a read-only fast-path allow; a real command keeps the ask.
  const decision = await gate.decide(subCall('bash', { command: 'pnpm test\necho done', description: 'two lines' }))
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /\[args: pnpm test echo done\]/)
})

test('ptc: request mode allows a read-only sub-call', async () => {
  const gate = makeGate('request')
  assert.deepEqual(await gate.decide(subCall('read', { path: 'src/a.ts' })), { kind: 'allow' })
})

test('ptc: the read-only git fast-path still applies to a bash sub-call', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(subCall('bash', { command: 'git status --short' }))
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(gate.logs, ['[dsh-user-approval[read-only-git]] decision=allow detail=status'])
})

test('ptc: auto-edit allows the edit sub-call but asks for shell', async () => {
  const gate = makeGate('auto-edit')
  assert.deepEqual(await gate.decide(subCall('write', { path: 'src/a.ts' })), { kind: 'allow' })
  const shell = await gate.decide(subCall('bash', { command: 'pnpm test' }, 2))
  assert.equal(shell.kind, 'ask')
  assert.match(shell.reason ?? '', /\[args: pnpm test\]/)
})

test('ptc: smart classifies a bash sub-call after the danger list, with no LLM seam', async () => {
  const gate = makeGate('smart')
  // The built-in danger list hits before any LLM call, so this needs no seam.
  const dangerous = await gate.decide(subCall('bash', { command: 'rm -rf /' }))
  assert.equal(dangerous.kind, 'ask')
  assert.match(dangerous.reason ?? '', /\[smart: pattern=/)
  assert.match(dangerous.reason ?? '', /\[args: rm -rf \/\]/)

  // A benign command reaches the missing LLM seam and falls back to manual review.
  const benign = await gate.decide(subCall('bash', { command: 'pnpm build' }, 2))
  assert.equal(benign.kind, 'ask')
  assert.match(benign.reason ?? '', /\[smart: llm-unavailable\]/)
  assert.match(benign.reason ?? '', /\[args: pnpm build\]/)
})

test('ptc: smart allows a read-only git sub-call without the LLM', async () => {
  const gate = makeGate('smart')
  assert.deepEqual(await gate.decide(subCall('bash', { command: 'git log -1' })), { kind: 'allow' })
  assert.deepEqual(gate.logs, ['[dsh-user-approval[read-only-git]] decision=allow detail=log'])
})

test('ptc: removing run_code from autoAllowTools restores the per-program prompt', async () => {
  const gate = makeGate('request', { autoAllowTools: ['exit_plan_mode'] })
  const decision = await gate.decide(runCode())
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /\[other\] Tool: run_code \| Mode: request/)
  assert.ok(!(decision.reason ?? '').includes('[args:'), 'a top-level call is not a PTC sub-call')
})

test('ptc: native calls keep their untouched ask reason (no argument suffix)', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide({ name: 'write', arguments: { path: 'src/a.ts', content: 'x' } })
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /\[edit\] Tool: write \| Mode: request/)
  assert.ok(!(decision.reason ?? '').includes('[args:'), 'the host dialog already shows native arguments')
})

test('ptc: a long sub-call argument summary is capped with an ellipsis', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(subCall('bash', { command: `pnpm ${'a'.repeat(400)}` }))
  assert.equal(decision.kind, 'ask')
  assert.ok((decision.reason ?? '').endsWith('…]'), 'the preview must end with the capped marker')
  const preview = /\[args: (.*)\]$/u.exec(decision.reason ?? '')?.[1]
  assert.ok(preview !== undefined && preview.length <= 201, `preview too long: ${preview?.length}`)
})

test('ptc: a sub-call with no readable argument still gets a JSON summary', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(subCall('custom_tool', { todos: [{ content: 'x', status: 'pending' }] }))
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /\[args: \{"todos":\[/)
})

test('ptc: the default ask copy ships bilingual through displayReason', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(subCall('write', { path: 'src/a.ts', content: 'x' }))
  assert.equal(decision.kind, 'ask')
  // English reason is what the session log and non-zh UIs keep.
  assert.equal(decision.reason, '[edit] Tool: write | Mode: request [args: src/a.ts]')
  // The zh display variant carries the SAME decision info (args suffix included).
  assert.deepEqual(decision.displayReason, {
    en: '[edit] Tool: write | Mode: request [args: src/a.ts]',
    zh: '[edit] 工具: write | 模式: request [args: src/a.ts]',
  })
})

test('ptc: a custom askReason displays verbatim and stays single-language', async () => {
  const gate = makeGate('request', { askReason: 'custom copy for {tool} in {mode} mode' })
  const decision = await gate.decide(subCall('write', { path: 'src/a.ts', content: 'x' }))
  assert.equal(decision.kind, 'ask')
  assert.equal(decision.reason, 'custom copy for write in request mode [args: src/a.ts]')
  assert.equal(decision.displayReason, undefined, 'a custom template never rides the displayReason channel')
})

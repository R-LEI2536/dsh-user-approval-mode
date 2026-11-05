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
 * - `run_code` is transport: auto-allowed in every mode, never classified;
 * - sub-calls are classified by family exactly like native calls;
 * - a PTC sub-call's ask reason carries an argument summary because the host
 *   approval dialog cannot show a nested call's arguments;
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

interface Decision { readonly kind: string; readonly reason?: string }
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

/** A `run_code` top-level call (no parent). */
const runCode = (code = 'const x = 1; return x') => ({
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

test('ptc: run_code is auto-allowed as transport in every mode', async () => {
  for (const mode of ['request', 'auto-edit', 'smart', 'yolo', 'off'] as const) {
    const gate = makeGate(mode)
    assert.deepEqual(await gate.decide(runCode()), { kind: 'allow' }, `mode=${mode}`)
    assert.deepEqual(gate.logs, [], `mode=${mode} must not log a decision for the transport`)
  }
})

test('ptc: request mode asks for a write sub-call and shows its path', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide(subCall('write', { path: 'src/a.ts', content: 'x' }))
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /approval needed for write under request mode \(edit\)/)
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
  assert.match(decision.reason ?? '', /approval needed for run_code under request mode \(other\)/)
  assert.ok(!(decision.reason ?? '').includes('[args:'), 'a top-level call is not a PTC sub-call')
})

test('ptc: native calls keep their untouched ask reason (no argument suffix)', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide({ name: 'write', arguments: { path: 'src/a.ts', content: 'x' } })
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /approval needed for write under request mode \(edit\)/)
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

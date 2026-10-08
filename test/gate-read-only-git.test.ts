/**
 * Gate-level tests for the read-only git fast-path.
 *
 * `read-only-git.ts` and the smart evaluator are unit-tested elsewhere; what
 * those cannot catch is the wiring inside `apply()` — the family check, the
 * mode dispatch, the kill switch, the decision-log tag, and the ordering
 * against the sandbox-escalation guard. So this file drives the REAL gate
 * with a minimal fake Context: `tools/pre-execute` is captured, the config
 * comes from the real `Config` schema (defaults included), and `next()`
 * reports the downstream `allow` a plain host would.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config, setApprovalMode, type ApprovalMode, type Config as ApprovalConfig } from '../src/index.ts'

interface Decision { readonly kind: string; readonly reason?: string }
type PreExecute = (
  exec: { name: string; arguments: unknown; agent?: unknown },
  next: () => Promise<Decision>,
) => Promise<Decision>

interface Gate {
  decide: (command: string, extra?: Record<string, unknown>, toolName?: string) => Promise<Decision>
  logs: string[]
}

let gateCounter = 0

function makeGate(mode: ApprovalMode, configOverrides: ApprovalConfig = {}): Gate {
  // A distinct session object per gate keeps the plugin's WeakMap-backed mode
  // storage from leaking between tests.
  gateCounter += 1
  const session = { id: `session-${gateCounter}`, header: { cwd: '/tmp' } }
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
    decide: (command, extra = {}, toolName = 'bash') => {
      assert.ok(handler !== undefined, 'the gate must register tools/pre-execute')
      return handler(
        { name: toolName, arguments: { command, description: 'test', ...extra }, agent: { session } },
        async () => ({ kind: 'allow' }),
      )
    },
  }
}

const READ_ONLY_LOG = '[dsh-user-approval[read-only-git]] decision=allow detail='

test('gate: request mode allows a read-only git command and logs it', async () => {
  const gate = makeGate('request')
  const decision = await gate.decide('git status --short')
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(gate.logs, [`${READ_ONLY_LOG}status`])
})

test('gate: request mode still asks for every other shell command', async () => {
  const gate = makeGate('request')
  assert.equal((await gate.decide('git push origin main')).kind, 'ask')
  assert.equal((await gate.decide('git status && rm -rf /')).kind, 'ask')
  assert.equal((await gate.decide('git branch -D feature')).kind, 'ask')
  assert.deepEqual(gate.logs, [], 'only the fast-path may log an allow here')
})

test('gate: auto-edit mode allows the read-only forms too', async () => {
  const gate = makeGate('auto-edit')
  assert.equal((await gate.decide('git log --oneline -5')).kind, 'allow')
  assert.equal((await gate.decide('git diff --stat')).kind, 'allow')
  assert.equal((await gate.decide('npm install')).kind, 'ask')
})

test('gate: the deployer kill switch restores "shell always asks"', async () => {
  const gate = makeGate('request', { readOnlyGitCommands: false })
  assert.equal((await gate.decide('git status')).kind, 'ask')
  assert.deepEqual(gate.logs, [])
})

test('gate: smart mode takes the fast-path without an LLM seam', async () => {
  // `ctx.get('llm')` is undefined in this fake host: the fast-path must not
  // need it, and must not report the smart fail-safe `llm-unavailable`.
  const gate = makeGate('smart')
  const decision = await gate.decide('git status')
  assert.deepEqual(decision, { kind: 'allow' })
  assert.deepEqual(gate.logs, [`${READ_ONLY_LOG}status`])
  assert.ok(
    gate.logs.every((line) => !line.includes('[smart]')),
    'the fast-path uses its own tag, not the smart decision tag',
  )
})

test('gate: smart mode still asks when the git command requests a sandbox escalation', async () => {
  const gate = makeGate('smart')
  const decision = await gate.decide('git status', {
    sandbox_permissions: 'danger-full-access',
    justification: 'need to read outside the workspace',
  })
  assert.equal(decision.kind, 'ask')
  assert.match(decision.reason ?? '', /sandbox/)
})

test('gate: off mode is untouched (no ask, no fast-path log)', async () => {
  const gate = makeGate('off')
  assert.deepEqual(await gate.decide('git push origin main'), { kind: 'allow' })
  // A read-only command must not log or rebuild the downstream decision
  // either: off is "the gate does not intercept anything".
  assert.deepEqual(await gate.decide('git status'), { kind: 'allow' })
  assert.deepEqual(gate.logs, [])
})

test('gate: yolo mode is untouched by the fast-path', async () => {
  const gate = makeGate('yolo')
  assert.deepEqual(await gate.decide('git status'), { kind: 'allow' })
  assert.deepEqual(gate.logs, [])
})

test('gate: a non-shell tool is unaffected by the fast-path', async () => {
  // `write` is the edit family: request mode asks, and the fact that its
  // arguments happen to look like a read-only git command changes nothing.
  const gate = makeGate('request')
  assert.equal((await gate.decide('git status', {}, 'write')).kind, 'ask')
  assert.deepEqual(gate.logs, [])
})

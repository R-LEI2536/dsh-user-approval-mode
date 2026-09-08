/**
 * Unit tests for the sandbox-escalation helpers.
 *
 * The helpers are pure: they parse `sandbox_permissions` / `justification`
 * from a tool's parsed arguments and decide whether the target is strictly
 * wider than the call's effective mode. These tests pin both halves without
 * touching the live gate.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSandboxEscalation,
  currentSandboxFor,
  isSandboxEscalation,
  type ParsedSandboxEscalation,
} from '../src/sandbox-escalation.ts'

test('getSandboxEscalation: parses a valid escalation pair', () => {
  const args = { command: 'git push', sandbox_permissions: 'danger-full-access', justification: 'need network' }
  const result = getSandboxEscalation(args)
  assert.deepEqual(result, { requested: 'danger-full-access', justification: 'need network' })
  assert.ok(Object.isFrozen(result))
})

test('getSandboxEscalation: returns undefined when no escalation fields are present', () => {
  assert.equal(getSandboxEscalation({ command: 'ls' }), undefined)
  assert.equal(getSandboxEscalation({}), undefined)
})

test('getSandboxEscalation: returns undefined when justification is missing', () => {
  assert.equal(getSandboxEscalation({ sandbox_permissions: 'danger-full-access' }), undefined)
})

test('getSandboxEscalation: returns undefined when sandbox_permissions is missing', () => {
  assert.equal(getSandboxEscalation({ justification: 'why' }), undefined)
})

test('getSandboxEscalation: rejects empty justification', () => {
  assert.equal(
    getSandboxEscalation({ sandbox_permissions: 'danger-full-access', justification: '   ' }),
    undefined,
  )
})

test('getSandboxEscalation: rejects non-string target mode', () => {
  assert.equal(
    getSandboxEscalation({ sandbox_permissions: 42, justification: 'why' }),
    undefined,
  )
})

test('getSandboxEscalation: rejects target mode outside the closed vocabulary', () => {
  assert.equal(
    getSandboxEscalation({ sandbox_permissions: 'sudo', justification: 'why' }),
    undefined,
  )
})

test('getSandboxEscalation: returns undefined for non-object inputs', () => {
  assert.equal(getSandboxEscalation(undefined), undefined)
  assert.equal(getSandboxEscalation(null), undefined)
  assert.equal(getSandboxEscalation('hi'), undefined)
  assert.equal(getSandboxEscalation(42), undefined)
  assert.equal(getSandboxEscalation([1, 2]), undefined)
})

test('currentSandboxFor: prefers session override over the default', () => {
  assert.equal(currentSandboxFor('danger-full-access', 'workspace-write'), 'danger-full-access')
})

test('currentSandboxFor: falls back to the composition default', () => {
  assert.equal(currentSandboxFor(undefined, 'workspace-write'), 'workspace-write')
  assert.equal(currentSandboxFor(undefined, 'read-only'), 'read-only')
})

test('currentSandboxFor: falls back to workspace-write when nothing is composed', () => {
  assert.equal(currentSandboxFor(undefined, undefined), 'workspace-write')
})

test('isSandboxEscalation: read-only → workspace-write is widening', () => {
  assert.equal(isSandboxEscalation('workspace-write', 'read-only'), true)
})

test('isSandboxEscalation: read-only → danger-full-access is widening', () => {
  assert.equal(isSandboxEscalation('danger-full-access', 'read-only'), true)
})

test('isSandboxEscalation: workspace-write → danger-full-access is widening', () => {
  assert.equal(isSandboxEscalation('danger-full-access', 'workspace-write'), true)
})

test('isSandboxEscalation: same mode is NOT widening', () => {
  assert.equal(isSandboxEscalation('workspace-write', 'workspace-write'), false)
  assert.equal(isSandboxEscalation('read-only', 'read-only'), false)
  assert.equal(isSandboxEscalation('danger-full-access', 'danger-full-access'), false)
})

test('isSandboxEscalation: narrower target is NOT widening', () => {
  assert.equal(isSandboxEscalation('read-only', 'workspace-write'), false)
  assert.equal(isSandboxEscalation('workspace-write', 'danger-full-access'), false)
})

test('isSandboxEscalation: nothing is wider than danger-full-access', () => {
  assert.equal(isSandboxEscalation('read-only', 'danger-full-access'), false)
  assert.equal(isSandboxEscalation('workspace-write', 'danger-full-access'), false)
})

test('integration: workspace-write + danger-full-access ask is escalation', () => {
  const args = { command: 'git push', sandbox_permissions: 'danger-full-access', justification: 'push' }
  const parsed: ParsedSandboxEscalation | undefined = getSandboxEscalation(args)
  assert.ok(parsed !== undefined)
  assert.equal(isSandboxEscalation(parsed.requested, 'workspace-write'), true)
})

test('integration: workspace-write + workspace-write is NOT escalation', () => {
  const args = { command: 'ls', sandbox_permissions: 'workspace-write', justification: 'confirm' }
  const parsed = getSandboxEscalation(args)
  assert.ok(parsed !== undefined)
  assert.equal(isSandboxEscalation(parsed.requested, 'workspace-write'), false)
})

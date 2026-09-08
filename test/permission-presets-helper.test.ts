/**
 * Tests for the permission-presets bridge helper.
 *
 * `findAskPresetForSandbox` is the pure half of the `applyMode` fix: it
 * picks a preset whose `(sandbox, approval)` bundle matches the target
 * sandbox + `ask`. These tests cover the three observable behaviors:
 *   - returns undefined when no service is mounted (host without
 *     dsh-permission-presets)
 *   - returns the matching preset name when one exists
 *   - returns undefined when no preset pairs the target with `ask`
 *     (e.g. user customized sandboxDefaults to `read-only`)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  findAskPresetForSandbox,
  type PermissionPresetsServiceLike,
} from '../src/permission-presets-helper.ts'

function makeService(
  presets: Record<string, { sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'; approval: 'ask' | 'never' }>,
): PermissionPresetsServiceLike & { setCalls: Array<{ session: unknown; name: string }> } {
  const setCalls: Array<{ session: unknown; name: string }> = []
  return {
    names: Object.keys(presets),
    resolve(name) {
      const spec = presets[name]
      if (spec === undefined) {
        throw new Error(`test: preset ${name} not in table`)
      }
      return spec
    },
    set(session, name) {
      setCalls.push({ session, name })
    },
    get setCalls() { return setCalls },
  }
}

test('findAskPresetForSandbox: undefined service → undefined', () => {
  assert.equal(findAskPresetForSandbox(undefined, 'workspace-write'), undefined)
})

test('findAskPresetForSandbox: matches workspace-write + ask preset (default table)', () => {
  const service = makeService({
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
  })
  assert.equal(findAskPresetForSandbox(service, 'workspace-write'), 'workspace-write')
})

test('findAskPresetForSandbox: matches danger-full-access + ask when deployed', () => {
  // Deployer who explicitly defines a danger-full-access + ask preset
  // (uncommon but legal) — the helper should pick it.
  const service = makeService({
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access-ask': { sandbox: 'danger-full-access', approval: 'ask' },
  })
  assert.equal(findAskPresetForSandbox(service, 'danger-full-access'), 'danger-full-access-ask')
})

test('findAskPresetForSandbox: read-only sandbox → no matching ask preset', () => {
  // Default preset table has no read-only entry. The deployer who
  // customized sandboxDefaults.smart to read-only will see the orphan
  // state in the UI; this helper correctly returns undefined so the
  // caller falls back to a direct setSandboxMode.
  const service = makeService({
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
  })
  assert.equal(findAskPresetForSandbox(service, 'read-only'), undefined)
})

test('findAskPresetForSandbox: presets that pair sandbox with never are NOT matched', () => {
  // The matcher is approval=ask specifically; the `danger-full-access`
  // preset pairs its sandbox with `never`, not `ask`.
  const service = makeService({
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
  })
  assert.equal(findAskPresetForSandbox(service, 'danger-full-access'), undefined)
})

test('findAskPresetForSandbox: returns the first match when several presets share the bundle', () => {
  // Two presets with the same (sandbox, ask) bundle — first wins. The
  // helper is order-preserving (Object.keys iteration), so this is
  // deterministic.
  const service = makeService({
    'first': { sandbox: 'workspace-write', approval: 'ask' },
    'second': { sandbox: 'workspace-write', approval: 'ask' },
  })
  assert.equal(findAskPresetForSandbox(service, 'workspace-write'), 'first')
})

test('findAskPresetForSandbox: empty preset table → undefined', () => {
  const service = makeService({})
  assert.equal(findAskPresetForSandbox(service, 'workspace-write'), undefined)
  assert.equal(findAskPresetForSandbox(service, 'read-only'), undefined)
  assert.equal(findAskPresetForSandbox(service, 'danger-full-access'), undefined)
})

test('findAskPresetForSandbox: integrate with PermissionPresetsServiceLike.set — set receives the chosen preset', () => {
  // The helper is consumed by `applyMode`, which then calls
  // `service.set(session, presetName)`. The mock here records every
  // set call so we can assert the integration contract: pick → call
  // set with the same name, on the same session.
  const session = { id: 'session-stub' } as unknown as Session
  const service = makeService({
    'workspace-write': { sandbox: 'workspace-write', approval: 'ask' },
    'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
  })
  const presetName = findAskPresetForSandbox(service, 'workspace-write')
  assert.equal(presetName, 'workspace-write')
  if (presetName !== undefined) {
    service.set(session, presetName)
  }
  assert.equal(service.setCalls.length, 1)
  assert.deepEqual(service.setCalls[0], { session, name: 'workspace-write' })
})

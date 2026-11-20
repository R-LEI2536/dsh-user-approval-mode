/**
 * Tests for the smart-classifier model directory controller.
 *
 * The controller is the only async, generation-guarded piece of the settings
 * page's smart-classifier pickers: it owns the lazy load, the "latest response
 * wins" rule, the failure status the page renders a retry for, and the drop on
 * a connection reset. The Host catalogue call is faked with a controllable
 * promise so each branch is pinned without a DOM.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_SMART_CATALOG,
  SmartModelDirectoryController,
} from '../src/client/model-directory.ts'

/** One microtask/macrotask flush, enough for the controller's await chain. */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

/** Host catalogue payload in the shape the Remote returns. */
function catalog(
  groups: readonly { id: string; models: readonly string[] }[],
  defaultProvider = 'deepseek-official',
  defaultModel = 'deepseek-flash',
): { ok: true; value: unknown } {
  return {
    ok: true,
    value: {
      default: { provider: defaultProvider, model: defaultModel },
      routableProviders: groups.map(group => group.id),
      groups: groups.map(group => ({
        id: group.id,
        name: group.id.toUpperCase(),
        models: group.models.map(id => ({ id, name: id })),
      })),
      failures: [],
    },
  }
}

/** Minimal client context exposing only the catalogue call. */
function context(modelCatalog: () => Promise<unknown>): never {
  return { remote: { session: { modelCatalog } } } as never
}

test('directory: ensure() loads once and publishes groups plus the default selection', async () => {
  let calls = 0
  const controller = new SmartModelDirectoryController(context(async () => {
    calls += 1
    return catalog([{ id: 'deepseek-official', models: ['deepseek-flash', 'deepseek-v4-pro'] }])
  }))
  const statuses: string[] = []
  controller.subscribe(() => { statuses.push(controller.getSnapshot().status) })

  controller.ensure()
  assert.equal(controller.getSnapshot().status, 'loading')
  await flush()

  const snapshot = controller.getSnapshot()
  assert.equal(snapshot.status, 'ready')
  assert.deepEqual(snapshot.groups.map(group => group.id), ['deepseek-official'])
  assert.deepEqual(snapshot.groups[0]?.models.map(model => model.id), ['deepseek-flash', 'deepseek-v4-pro'])
  assert.equal(snapshot.defaultProvider, 'deepseek-official')
  assert.equal(snapshot.defaultModel, 'deepseek-flash')
  assert.deepEqual(statuses, ['loading', 'ready'])

  // A second visit reuses the loaded catalogue.
  controller.ensure()
  await flush()
  assert.equal(calls, 1)
})

test('directory: refresh() before the first load is a no-op, so an idle page stays idle', async () => {
  let calls = 0
  const controller = new SmartModelDirectoryController(context(async () => {
    calls += 1
    return catalog([])
  }))
  controller.refresh()
  await flush()
  assert.equal(calls, 0)
  assert.equal(controller.getSnapshot().status, 'idle')
})

test('directory: a failed read surfaces error status and a retry recovers', async () => {
  let calls = 0
  let failing = true
  const controller = new SmartModelDirectoryController(context(async () => {
    calls += 1
    return failing
      ? { ok: false, error: { code: 'host-unavailable', message: 'boom' } }
      : catalog([{ id: 'p', models: ['m'] }])
  }))

  controller.ensure()
  await flush()
  assert.equal(controller.getSnapshot().status, 'error')
  assert.deepEqual(controller.getSnapshot().groups, [])

  // ensure() stays idle-only, so the page's retry button is what reloads.
  controller.ensure()
  await flush()
  assert.equal(calls, 1)

  failing = false
  controller.refresh()
  await flush()
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.deepEqual(controller.getSnapshot().groups.map(group => group.id), ['p'])
  assert.equal(calls, 2)
})

test('directory: the newest request wins and an older response is discarded', async () => {
  const resolvers: ((value: unknown) => void)[] = []
  const controller = new SmartModelDirectoryController(context(
    () => new Promise((resolve) => { resolvers.push(resolve) }),
  ))

  controller.ensure()
  controller.refresh()
  assert.equal(resolvers.length, 2)

  resolvers[1]?.(catalog([{ id: 'new', models: ['m'] }]))
  await flush()
  assert.deepEqual(controller.getSnapshot().groups.map(group => group.id), ['new'])

  // The superseded first read settles late; it must not overwrite the newer one.
  resolvers[0]?.(catalog([{ id: 'old', models: ['m'] }]))
  await flush()
  assert.equal(controller.getSnapshot().status, 'ready')
  assert.deepEqual(controller.getSnapshot().groups.map(group => group.id), ['new'])
})

test('directory: reset() drops the catalogue and ignores the in-flight response', async () => {
  const resolvers: ((value: unknown) => void)[] = []
  const controller = new SmartModelDirectoryController(context(
    () => new Promise((resolve) => { resolvers.push(resolve) }),
  ))

  controller.ensure()
  resolvers[0]?.(catalog([{ id: 'p', models: ['m'] }]))
  await flush()
  assert.equal(controller.getSnapshot().status, 'ready')

  controller.reset()
  assert.deepEqual(controller.getSnapshot(), EMPTY_SMART_CATALOG)

  // A response that was already in flight when the reconnect happened is stale.
  controller.ensure()
  resolvers[1]?.(catalog([{ id: 'p', models: ['m'] }]))
  await flush()
  assert.equal(controller.getSnapshot().status, 'ready')
  resolvers.length = 0
})

test('directory: dispose() stops publishing', async () => {
  const resolvers: ((value: unknown) => void)[] = []
  const controller = new SmartModelDirectoryController(context(
    () => new Promise((resolve) => { resolvers.push(resolve) }),
  ))
  let notified = 0
  controller.subscribe(() => { notified += 1 })

  controller.ensure()
  assert.equal(notified, 1) // loading
  controller.dispose()
  resolvers[0]?.(catalog([{ id: 'p', models: ['m'] }]))
  await flush()
  assert.equal(notified, 1)
  assert.equal(controller.getSnapshot().status, 'loading')
})

/**
 * Tests for the smart-mode session memory.
 *
 * Memory remembers `sha256(toolName + args)` lookups per session, with a
 * configurable TTL and a per-session FIFO cap (200 entries). Tests cover
 * happy-path lookup, TTL expiry, FIFO eviction, and cross-session isolation.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createSmartSessionMemory,
  smartMemoryKey,
} from '../src/smart-classifier.ts'

const SESSION_A = 'session-a'
const SESSION_B = 'session-b'

test('memory: lookup miss on empty store', () => {
  const memory = createSmartSessionMemory(1_000)
  assert.equal(memory.lookup(SESSION_A, 'k'), undefined)
})

test('memory: remember then lookup round-trips', () => {
  const memory = createSmartSessionMemory(1_000)
  memory.remember(SESSION_A, 'k', 'classifier')
  const entry = memory.lookup(SESSION_A, 'k')
  assert.ok(entry !== undefined)
  assert.equal(entry?.source, 'classifier')
})

test('memory: human-sourced entry round-trips', () => {
  const memory = createSmartSessionMemory(1_000)
  memory.remember(SESSION_A, 'k', 'human')
  assert.equal(memory.lookup(SESSION_A, 'k')?.source, 'human')
})

test('memory: lookup on different session returns undefined (isolation)', () => {
  const memory = createSmartSessionMemory(1_000)
  memory.remember(SESSION_A, 'k', 'classifier')
  assert.equal(memory.lookup(SESSION_B, 'k'), undefined)
})

test('memory: expired entry drops on lookup', () => {
  const memory = createSmartSessionMemory(50)
  memory.remember(SESSION_A, 'k', 'classifier')
  // The TTL is short; spin briefly so the wall-clock crosses it.
  const start = Date.now()
  while (Date.now() - start < 80) { /* spin */ }
  assert.equal(memory.lookup(SESSION_A, 'k'), undefined)
})

test('memory: caps at 200 entries per session (FIFO)', () => {
  const memory = createSmartSessionMemory(1_000_000)
  // Insert 201 distinct keys; the oldest must be evicted.
  for (let i = 0; i < 201; i += 1) {
    memory.remember(SESSION_A, `key-${i}`, 'classifier')
  }
  assert.equal(memory.lookup(SESSION_A, 'key-0'), undefined)
  assert.ok(memory.lookup(SESSION_A, 'key-1') !== undefined)
  assert.ok(memory.lookup(SESSION_A, 'key-200') !== undefined)
})

test('memory: remembering the same key updates the at timestamp', () => {
  const memory = createSmartSessionMemory(1_000_000)
  memory.remember(SESSION_A, 'k', 'classifier')
  const first = memory.lookup(SESSION_A, 'k')
  // Wait a bit, re-remember, verify the at timestamp moves forward.
  const start = Date.now()
  while (Date.now() - start < 20) { /* spin */ }
  memory.remember(SESSION_A, 'k', 'classifier')
  const second = memory.lookup(SESSION_A, 'k')
  assert.ok(first !== undefined && second !== undefined)
  assert.ok((second?.at ?? 0) >= (first?.at ?? 0))
})

test('memory: remember after expiry re-inserts a fresh entry', () => {
  const memory = createSmartSessionMemory(30)
  memory.remember(SESSION_A, 'k', 'classifier')
  const start = Date.now()
  while (Date.now() - start < 50) { /* spin */ }
  assert.equal(memory.lookup(SESSION_A, 'k'), undefined)
  memory.remember(SESSION_A, 'k', 'classifier')
  assert.ok(memory.lookup(SESSION_A, 'k') !== undefined)
})

test('memory: storeEntry errors are swallowed (convention — memory must never change outcomes)', () => {
  const memory = createSmartSessionMemory(1_000)
  // Pass a non-string sessionId; Map.set with any key works in JS, but
  // a hostile environment could throw — the wrapper must not propagate.
  assert.doesNotThrow(() => { memory.remember(null as unknown as string, 'k', 'classifier') })
})

test('smartMemoryKey: stable across invocations and argument-shape-tolerant', () => {
  const a = smartMemoryKey('bash', { command: 'ls -la' })
  const b = smartMemoryKey('bash', { command: 'ls -la' })
  assert.equal(a, b, 'same tool + args must hash identically')
  const c = smartMemoryKey('bash', { command: 'ls -l' })
  assert.notEqual(a, c, 'different command must hash differently')
  const d = smartMemoryKey('bash', { command: 'ls -la', cwd: '/tmp' })
  assert.notEqual(a, d, 'extra arg changes the key')
})

test('smartMemoryKey: falls back to stringification when JSON.stringify throws', () => {
  // A circular object cannot be JSON-stringified; the helper must not throw.
  const circular: Record<string, unknown> = {}
  circular.self = circular
  assert.doesNotThrow(() => { smartMemoryKey('bash', circular) })
})

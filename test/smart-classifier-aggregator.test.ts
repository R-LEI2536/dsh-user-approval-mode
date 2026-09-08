/**
 * Tests for the streaming aggregator in `smart-classifier.ts`.
 *
 * The aggregator walks one LLM stream and returns a strict verdict. Any
 * protocol violation, tool-call emission, or non-stop finish must fall
 * back to `ask` with a discriminating `detail` string. Tests exercise
 * both the happy path (text → approve) and each failure mode.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { collectSmartClassifierText } from '../src/smart-classifier.ts'

interface StreamChunk {
  type: string
  index?: number
  blockType?: string
  text?: string
  block?: unknown
  reason?: { kind: string }
  // Forward-compatible fields the aggregator may inspect; the tests
  // exercise a few of them (usage, tool-call-delta id) and any future
  // chunk shape will flow through `unknown` at the call site.
  [extraField: string]: unknown
}

async function* chunks(items: StreamChunk[]): AsyncIterable<unknown> {
  for (const item of items) yield item
}

const noSignal = new AbortController().signal

test('aggregator: happy path — approve verdict through one text block', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '{"verdict":"approve"}' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '{"verdict":"approve"}' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]), noSignal)
  assert.deepEqual(result, { verdict: 'approve', detail: 'approve' })
})

test('aggregator: happy path — ask verdict across multiple deltas', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '{"verdict":' },
    { type: 'text-delta', index: 0, text: '"ask"}' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '{"verdict":"ask"}' } },
    { type: 'usage', usage: { input: 1, output: 1, total: 2 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]), noSignal)
  assert.deepEqual(result, { verdict: 'ask', detail: 'ask' })
})

test('aggregator: rejects tool-call emission', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '{"verdict":"approve"}' },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, argumentsDelta: '{}' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '{"verdict":"approve"}' } },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'c1', name: 'x', arguments: '{}' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]), noSignal)
  assert.equal(result.verdict, 'ask')
  assert.equal(result.detail, 'tool-call')
})

test('aggregator: protocol-invalid chunk returns ask', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'unknown-chunk-type', index: 0 },
    { type: 'finish', reason: { kind: 'stop' } },
  ]), noSignal)
  assert.deepEqual(result, { verdict: 'ask', detail: 'protocol-invalid' })
})

test('aggregator: missing finish returns ask', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '{}' } },
    // no finish
  ]), noSignal)
  assert.deepEqual(result, { verdict: 'ask', detail: 'missing-finish' })
})

test('aggregator: finish kind = length returns ask', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '{}' } },
    { type: 'finish', reason: { kind: 'length' } },
  ]), noSignal)
  assert.equal(result.verdict, 'ask')
  assert.match(result.detail, /^finish-/)
})

test('aggregator: invalid text payload returns invalid-response', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'not a json object' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'not a json object' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]), noSignal)
  assert.deepEqual(result, { verdict: 'ask', detail: 'invalid-response' })
})

test('aggregator: open blocks at finish → protocol-invalid', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    // no block-end
    { type: 'finish', reason: { kind: 'stop' } },
  ]), noSignal)
  assert.equal(result.verdict, 'ask')
  assert.equal(result.detail, 'protocol-invalid')
})

test('aggregator: chunks after finish → protocol-invalid', async () => {
  const result = await collectSmartClassifierText(chunks([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text: '{"verdict":"approve"}' } },
    { type: 'finish', reason: { kind: 'stop' } },
    { type: 'text-delta', index: 0, text: 'after-finish' },
  ]), noSignal)
  assert.equal(result.verdict, 'ask')
  assert.equal(result.detail, 'protocol-invalid')
})

test('aggregator: pre-aborted signal rejects with the abort reason', async () => {
  const controller = new AbortController()
  controller.abort(new Error('test aborted'))
  await assert.rejects(
    collectSmartClassifierText(chunks([{ type: 'finish', reason: { kind: 'stop' } }]), controller.signal),
    /test aborted/,
  )
})

/**
 * Tests for the smart-mode classifier verdict parser.
 *
 * The parser admits only the strictest shape: `{"verdict":"approve"}` or
 * `{"verdict":"ask"}`, with optional surrounding whitespace. Anything else
 * — multi-key objects, non-approve values, non-JSON, plain prose —
 * returns undefined, which the aggregator treats as `ask / invalid-response`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSmartClassifierVerdict } from '../src/smart-classifier.ts'

test('parseSmartClassifierVerdict: approves the exact approve shape', () => {
  assert.equal(parseSmartClassifierVerdict('{"verdict":"approve"}'), 'approve')
})

test('parseSmartClassifierVerdict: approves the exact ask shape', () => {
  assert.equal(parseSmartClassifierVerdict('{"verdict":"ask"}'), 'ask')
})

test('parseSmartClassifierVerdict: tolerates surrounding whitespace', () => {
  assert.equal(parseSmartClassifierVerdict('  \n{"verdict":"approve"}\n  '), 'approve')
  assert.equal(parseSmartClassifierVerdict('\t{"verdict":"ask"}\t'), 'ask')
})

test('parseSmartClassifierVerdict: tolerates inner whitespace', () => {
  assert.equal(parseSmartClassifierVerdict('{ "verdict" : "approve" }'), 'approve')
  assert.equal(parseSmartClassifierVerdict('{\n  "verdict":\t"ask"\n}'), 'ask')
})

test('parseSmartClassifierVerdict: rejects multi-key payloads', () => {
  assert.equal(parseSmartClassifierVerdict('{"verdict":"approve","reason":"safe"}'), undefined)
  assert.equal(parseSmartClassifierVerdict('{"verdict":"ask","reason":"unclear"}'), undefined)
})

test('parseSmartClassifierVerdict: rejects unknown verdict values', () => {
  assert.equal(parseSmartClassifierVerdict('{"verdict":"deny"}'), undefined)
  assert.equal(parseSmartClassifierVerdict('{"verdict":"yes"}'), undefined)
  assert.equal(parseSmartClassifierVerdict('{"verdict":"APPROVE"}'), undefined)
})

test('parseSmartClassifierVerdict: rejects malformed JSON', () => {
  assert.equal(parseSmartClassifierVerdict('{"verdict":"approve"'), undefined)
  assert.equal(parseSmartClassifierVerdict('{"verdict":"approve"'), undefined)
  assert.equal(parseSmartClassifierVerdict('not json at all'), undefined)
})

test('parseSmartClassifierVerdict: rejects non-object JSON', () => {
  assert.equal(parseSmartClassifierVerdict('"approve"'), undefined)
  assert.equal(parseSmartClassifierVerdict('42'), undefined)
  assert.equal(parseSmartClassifierVerdict('null'), undefined)
  assert.equal(parseSmartClassifierVerdict('[]'), undefined)
})

test('parseSmartClassifierVerdict: rejects wrapped or commented forms', () => {
  assert.equal(parseSmartClassifierVerdict('Here is the result: {"verdict":"approve"}'), undefined)
  assert.equal(parseSmartClassifierVerdict('```json\n{"verdict":"approve"}\n```'), undefined)
  assert.equal(parseSmartClassifierVerdict('// {"verdict":"approve"}'), undefined)
})

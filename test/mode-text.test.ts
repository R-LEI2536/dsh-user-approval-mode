/**
 * Tests for the chip's mode-text parser. The Web client has no DOM test runner,
 * so this pins the one piece of logic that can silently mis-display a mode:
 * the answer to a no-arg `/approval-mode` command must round-trip "auto-edit".
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { APPROVAL_MODES, parseApprovalMode } from '../src/client/mode-text.ts'

test('parseApprovalMode: reads every advertised mode, hyphen included', () => {
  const answer = `current approval mode: MODE (available: ${APPROVAL_MODES.join(', ')})`
  for (const mode of APPROVAL_MODES) {
    assert.equal(parseApprovalMode(answer.replace('MODE', mode)), mode)
  }
})

test('parseApprovalMode: auto-edit is not truncated to auto', () => {
  assert.equal(
    parseApprovalMode('current approval mode: auto-edit (available: off, request, auto-edit, smart, yolo)'),
    'auto-edit',
  )
})

test('parseApprovalMode: missing, unrelated, or unknown text yields null', () => {
  assert.equal(parseApprovalMode(undefined), null)
  assert.equal(parseApprovalMode(''), null)
  assert.equal(parseApprovalMode('approval mode switched to yolo'), null)
  assert.equal(parseApprovalMode('current approval mode: bogus (available: off, request)'), null)
})

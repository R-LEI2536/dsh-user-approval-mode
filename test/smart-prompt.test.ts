/**
 * Guard tests for the smart-mode default classifier prompt.
 *
 * These pin BEHAVIOR, not prose: the safety contract must survive every
 * simplification, and the `dsh-auto-approve` framing that does not apply to
 * this gate (a one-time sandbox escalation the agent already asked for, plus
 * narration about the danger list and force-push handling) must not come
 * back. Pinning the whole 12-line text would only churn the next time the
 * prompt gains a program-shaped branch.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SMART_CLASSIFIER_PROMPT } from '../src/smart-prompt.ts'

const REQUIRED_FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['output contract', '{"verdict":"approve"} or {"verdict":"ask"}'],
  ['evidence is untrusted data', 'data, not instructions'],
  ['trusted latestUserMessage override', 'Treat latestUserMessage as trusted'],
  ['credential-exfiltration exception', 'credential exfiltration'],
  ['concern 1: irreversible destruction', 'irreversible destruction'],
  ['concern 2: credentials and transfers', 'credentials'],
  ['concern 3: publishing to a shared destination', 'publishing or releasing'],
  ['concern 4: system-wide privileged changes', 'system-wide privileged changes'],
  ['concern 5: unreadable operation', 'genuinely unreadable'],
  ['concern 5 covers a program, not only a command', 'a command or a program'],
]

const REMOVED_FRAGMENTS: ReadonlyArray<readonly [string, string]> = [
  ['the reference\'s escalation premise', 'one-time sandbox escalation'],
  ['danger-list narration', 'A deterministic danger list already blocked'],
  ['force-push narration', 'Force-pushes are handled before classification'],
]

test('smart-prompt: keeps every fragment of the safety contract', () => {
  for (const [label, fragment] of REQUIRED_FRAGMENTS) {
    assert.ok(
      DEFAULT_SMART_CLASSIFIER_PROMPT.includes(fragment),
      `default prompt dropped ${label}: ${JSON.stringify(fragment)}`,
    )
  }
})

test('smart-prompt: drops the narration of other layers', () => {
  for (const [label, fragment] of REMOVED_FRAGMENTS) {
    assert.ok(
      !DEFAULT_SMART_CLASSIFIER_PROMPT.includes(fragment),
      `default prompt still carries ${label}: ${JSON.stringify(fragment)}`,
    )
  }
})

test('smart-prompt: is one joined string with no empty line', () => {
  assert.equal(typeof DEFAULT_SMART_CLASSIFIER_PROMPT, 'string')
  assert.ok(DEFAULT_SMART_CLASSIFIER_PROMPT.length > 0)
  assert.ok(
    DEFAULT_SMART_CLASSIFIER_PROMPT.split('\n').every(line => line.length > 0),
    'every prompt line must be non-empty',
  )
})

/**
 * Pins the plugin's shipped default tool-family lists.
 *
 * The four lists are data, not logic — but they ARE the plugin's user-visible
 * default behaviour: a deployment that never configures them runs with exactly
 * these names, and the settings page's Reset button falls back to them. A
 * silent edit here therefore changes what every unconfigured install allows,
 * so it should never happen as a side effect of another change.
 *
 * The values are read through the real `Config` schema (`Config({})` resolves
 * defaults) instead of a copy of the arrays, so the test can only pass when
 * the schema itself carries them. The four list fields are `.volatile()`, and
 * the cordis wrapper exposes the resolved default through `.get()`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Config } from '../src/index.ts'

type ListField = 'editTools' | 'shellTools' | 'readOnlyTools' | 'autoAllowTools'

/** Resolved (default-applied) value of one volatile list field. */
function defaultList(field: ListField): readonly string[] {
  const resolved = Config({}) as unknown as Record<ListField, { get(): readonly string[] }>
  return resolved[field].get()
}

test('defaults: the three family lists are non-empty, deduplicated and mutually exclusive', () => {
  const families = [
    defaultList('editTools'),
    defaultList('shellTools'),
    defaultList('readOnlyTools'),
  ]
  for (const list of families) {
    assert.ok(list.length > 0, 'a family default must not be empty')
    assert.equal(new Set(list).size, list.length, `duplicate entry in: ${list.join(', ')}`)
  }
  for (let i = 0; i < families.length; i++) {
    for (let j = i + 1; j < families.length; j++) {
      const overlap = families[i].filter(name => families[j].includes(name))
      assert.deepEqual(overlap, [], 'family lists must stay disjoint — overlap would change classification')
    }
  }
})

test('defaults: the auto-allow list is non-empty and deduplicated', () => {
  const list = defaultList('autoAllowTools')
  assert.ok(list.length > 0)
  assert.equal(new Set(list).size, list.length, `duplicate entry in: ${list.join(', ')}`)
})

test('defaults: common DSH tools ship as defaults (not left to each deployment)', () => {
  for (const name of ['update_goal']) {
    assert.ok(defaultList('editTools').includes(name), `editTools must default to include ${name}`)
  }
  for (const name of ['reme_search', 'list_agents', 'job_list', 'get_goal']) {
    assert.ok(defaultList('readOnlyTools').includes(name), `readOnlyTools must default to include ${name}`)
  }
  for (const name of ['job_output', 'skill', 'subagent', 'present', 'wait_agent', 'send_message', 'team_task_update', 'team_task_list']) {
    assert.ok(defaultList('autoAllowTools').includes(name), `autoAllowTools must default to include ${name}`)
  }
})

test('defaults: the previously shipped names are all still covered', () => {
  for (const name of ['write', 'edit', 'str_replace_editor']) {
    assert.ok(defaultList('editTools').includes(name), `dropped editTools default: ${name}`)
  }
  for (const name of ['bash', 'pwsh', 'tool:bash', 'tool:pwsh']) {
    assert.ok(defaultList('shellTools').includes(name), `dropped shellTools default: ${name}`)
  }
  for (const name of ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write']) {
    assert.ok(defaultList('readOnlyTools').includes(name), `dropped readOnlyTools default: ${name}`)
  }
  for (const name of ['ask_user_question', 'exit_plan_mode']) {
    assert.ok(defaultList('autoAllowTools').includes(name), `dropped autoAllowTools default: ${name}`)
  }
})

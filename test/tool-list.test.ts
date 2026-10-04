/**
 * Tests for the CSV contract shared by the four tool-family list fields on the
 * approval settings page. The control itself cannot be tested here (this repo
 * carries no DOM test runner), so these pin the value normalization — the only
 * logic that can silently corrupt a saved list.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatToolList,
  parseToolList,
  sameToolList,
} from '../src/client/tool-list.ts'

test('parseToolList: empty and separator-only text yields no tools', () => {
  assert.deepEqual(parseToolList(''), [])
  assert.deepEqual(parseToolList('   '), [])
  assert.deepEqual(parseToolList(',,,'), [])
})

test('parseToolList: splits on commas and trims each token', () => {
  assert.deepEqual(parseToolList('write, edit'), ['write', 'edit'])
  assert.deepEqual(parseToolList('  bash ,pwsh, tool:bash '), ['bash', 'pwsh', 'tool:bash'])
})

test('parseToolList: drops empty tokens and deduplicates, keeping the first occurrence', () => {
  assert.deepEqual(parseToolList(' a ,, b , a '), ['a', 'b'])
  assert.deepEqual(parseToolList('read, read, glob'), ['read', 'glob'])
})

test('parseToolList: newlines separate tokens too, so a pasted multi-line list parses', () => {
  assert.deepEqual(parseToolList('read\nglob\r\n\r\ngrep'), ['read', 'glob', 'grep'])
})

test('formatToolList: comma-and-space join; an empty list renders as empty text', () => {
  assert.equal(formatToolList([]), '')
  assert.equal(formatToolList(['a']), 'a')
  assert.equal(formatToolList(['a', 'b']), 'a, b')
})

test('round trip: parseToolList(formatToolList(list)) is the identity', () => {
  const list = [
    'read', 'glob', 'grep', 'read_image', 'list_directory',
    'todo_write', 'reme_search', 'list_agents',
  ]
  assert.deepEqual(parseToolList(formatToolList(list)), list)
  assert.deepEqual(parseToolList(formatToolList([])), [])
})

test('sameToolList: entry-wise comparison backs the commit no-op guard', () => {
  assert.equal(sameToolList([], []), true)
  assert.equal(sameToolList(['a', 'b'], ['a', 'b']), true)
  assert.equal(sameToolList(['a', 'b'], ['b', 'a']), false)
  assert.equal(sameToolList(['a'], ['a', 'b']), false)
  assert.equal(sameToolList(['a', 'b'], ['a']), false)
})

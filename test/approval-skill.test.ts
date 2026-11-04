/**
 * Pins the packaged approval shell style skill.
 *
 * The skill is a user-visible asset: installing the plugin must expose exactly
 * one catalog entry with stable metadata, and the packaged SKILL.md must match
 * that metadata. These tests also guard the packaging whitelist: a `files`
 * entry that misses `skills/` ships a plugin whose registration silently
 * degrades to a warning.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { APPROVAL_SHELL_SKILL, registerApprovalShellSkill } from '../src/approval-skill.ts'

const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url))
const SKILL_PATH = fileURLToPath(new URL(`../skills/${APPROVAL_SHELL_SKILL}/SKILL.md`, import.meta.url))

interface Candidate {
  name: string
  description: string
  whenToUse?: string
  invocation: { modelInvocable: boolean; userInvocable: boolean }
  provider: string
  source: string
  path?: string
  resourceBase?: { kind: string; path: string }
  rank: number
}

interface Provider {
  name: string
  list(): Promise<readonly Candidate[]>
  get(candidate: Candidate): Promise<{ content: string; name: string; description: string }>
}

/** Minimal Cordis/skill-registry stand-in that records what the plugin registers. */
function mount(withSkills: boolean): { providers: Provider[]; deps: string[][] } {
  const providers: Provider[] = []
  const deps: string[][] = []
  const skills = {
    registerProvider(create: (control: { signal: AbortSignal; invalidate(): void }) => Provider): () => void {
      providers.push(create({ signal: new AbortController().signal, invalidate() {} }))
      return () => {}
    },
  }
  const child = {
    get: (name: string) => (withSkills && name === 'skills' ? skills : undefined),
    effect: (callback: () => unknown) => {
      const disposer = callback()
      assert.equal(typeof disposer, 'function', 'provider registration must return a disposer')
    },
  }
  const ctx = {
    inject: (wanted: string[], callback: (scope: typeof child) => void) => {
      deps.push(wanted)
      callback(child)
    },
    logger: { warn() {} },
  }
  registerApprovalShellSkill(ctx as never)
  return { providers, deps }
}

test('the skill is contributed through the optional skills service', () => {
  const { providers, deps } = mount(true)
  assert.deepEqual(deps, [['skills']])
  assert.equal(providers.length, 1)
  assert.equal(providers[0]?.name, 'dsh-user-approval')
})

test('a host without the skills service does not fail or register anything', () => {
  const { providers, deps } = mount(false)
  assert.deepEqual(deps, [['skills']])
  assert.equal(providers.length, 0)
})

test('the catalog entry carries stable, bounded metadata', async () => {
  const { providers } = mount(true)
  const provider = providers[0]
  assert.ok(provider)
  const candidates = await provider.list()
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  assert.ok(candidate)
  assert.equal(candidate.name, APPROVAL_SHELL_SKILL)
  assert.match(candidate.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'skill names are kebab-case')
  assert.ok(candidate.description.length > 0)
  assert.ok(candidate.description.length <= 500, 'the session catalog caps descriptions at 500 characters')
  assert.ok(!candidate.description.includes('\n'), 'description must stay on one line')
  assert.equal(candidate.invocation.modelInvocable, true)
  assert.equal(candidate.invocation.userInvocable, true)
  assert.equal(candidate.provider, 'dsh-user-approval')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.rank, 600, 'packaged skills must rank below project and user skills')
  assert.equal(candidate.path, SKILL_PATH)
  assert.deepEqual(candidate.resourceBase, { kind: 'directory', path: SKILL_PATH.replace(/SKILL\.md$/u, '') })
})

test('loading the skill returns the frontmatter-free body', async () => {
  const { providers } = mount(true)
  const provider = providers[0]
  assert.ok(provider)
  const [candidate] = await provider.list()
  assert.ok(candidate)
  const definition = await provider.get(candidate)
  assert.equal(definition.name, APPROVAL_SHELL_SKILL)
  assert.equal(definition.description, candidate.description)
  assert.ok(definition.content.length > 0)
  assert.ok(!definition.content.startsWith('---'), 'frontmatter must not leak into the loaded body')
  assert.match(definition.content, /read-only git fast path/i)
  assert.match(definition.content, /git status/)
})

test('the packaged SKILL.md matches the registered metadata', () => {
  const raw = readFileSync(SKILL_PATH, 'utf8').replace(/^\uFEFF/u, '')
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)?.[1]
  assert.ok(frontmatter, 'SKILL.md must carry YAML frontmatter')
  assert.match(frontmatter, new RegExp(`^name:\\s*${APPROVAL_SHELL_SKILL}$`, 'mu'))
  assert.match(frontmatter, /^description:\s*\S/mu)
  assert.match(frontmatter, /^whenToUse:\s*\S/mu)
})

test('the package whitelist ships the skill assets', () => {
  const manifest = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as { files?: string[] }
  assert.ok(Array.isArray(manifest.files), 'package.json must declare a files whitelist')
  assert.ok(
    manifest.files.some(entry => entry === 'skills' || entry === 'skills/'),
    'package.json files must list skills/ (the bundle patch has the same install-path failure mode)',
  )
})

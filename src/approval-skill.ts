/**
 * Registers the bundled approval-aware shell style skill.
 *
 * The skill documents this plugin's own gate: the always-allowed read-only
 * tools and the strict read-only git fast path. It ships inside the package
 * (`skills/dsh-approval-shell-style/SKILL.md`) and is contributed through the
 * optional `skills` service, so installing the plugin exposes it in the
 * session skill catalog and uninstalling the plugin removes it with the
 * provider registration.
 *
 * The service is typed structurally instead of importing
 * `@deepseek-ai/dsh-skill`: the plugin must keep loading on hosts whose
 * composition does not mount the skill registry, and the registered provider
 * is validated by the host at runtime. The shapes below mirror `SkillProvider`,
 * `SkillCandidate`, and `SkillDefinition` in that package; only the members
 * this module reads or writes are declared.
 *
 * @module dsh-user-approval
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'

/** Skill name this package contributes. Stable: it is the catalog identifier. */
export const APPROVAL_SHELL_SKILL = 'dsh-approval-shell-style'

/** Provider label reported to skill discovery. */
const PROVIDER = 'dsh-user-approval'

/** Packaged contributions rank last, so a project or user skill with the same
 *  name deliberately overrides this one instead of being shadowed by it. */
const BUNDLED_SKILL_RANK = 600

const SKILL_DIR = fileURLToPath(new URL('../skills/dsh-approval-shell-style/', import.meta.url))
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md')

/** Invocation policy resolved for one skill. */
interface SkillInvocation {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/** Directory a loaded skill resolves relative resources against. */
interface SkillResourceBase {
  readonly kind: 'directory'
  readonly path: string
}

/** Invocation-neutral summary the registry lists. */
interface SkillSummary {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly invocation: SkillInvocation
  readonly provider: string
  readonly source: string
  readonly path?: string
  readonly resourceBase?: SkillResourceBase
}

/** Catalog entry handed back to this provider for one load. */
interface SkillCandidate extends SkillSummary {
  readonly rank: number
  readonly locator: unknown
}

/** Complete skill body returned by `get`. */
interface SkillDefinition extends SkillSummary {
  readonly content: string
}

/** Lifecycle control passed to a provider factory. */
interface SkillProviderControl {
  readonly signal: AbortSignal
  readonly invalidate: () => void
}

/** Provider contract accepted by the skill registry. */
interface SkillProvider {
  readonly name: string
  list(): Promise<readonly SkillCandidate[]>
  get(candidate: SkillCandidate): Promise<SkillDefinition | undefined>
}

/** The optional host service this module contributes through. */
interface SkillsService {
  registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void
}

/** Parsed content of the packaged skill file. */
interface SkillAsset {
  readonly description: string
  readonly whenToUse?: string
  readonly content: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u

/** Read one plain single-line scalar out of the frontmatter block. */
function frontmatterScalar(frontmatter: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'mu').exec(frontmatter)
  const value = match?.[1]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

/**
 * Split the packaged SKILL.md into its discovery metadata and its body.
 * @param raw - File contents.
 * @param path - File path, for error messages.
 * @returns Description, optional routing hint, and the frontmatter-free body.
 */
function parseSkill(raw: string, path: string): SkillAsset {
  const frontmatter = FRONTMATTER.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`${PROVIDER}: ${path} has no YAML frontmatter`)
  const description = frontmatterScalar(frontmatter[1], 'description')
  if (description === undefined) throw new Error(`${PROVIDER}: ${path} has no description`)
  const whenToUse = frontmatterScalar(frontmatter[1], 'whenToUse')
  const content = raw.slice(frontmatter[0].length).trim()
  if (content.length === 0) throw new Error(`${PROVIDER}: ${path} has an empty body`)
  return whenToUse === undefined ? { description, content } : { description, whenToUse, content }
}

/** Build the provider that serves the already-parsed packaged skill. */
function createProvider(asset: SkillAsset): SkillProvider {
  const summary: SkillSummary = {
    name: APPROVAL_SHELL_SKILL,
    description: asset.description,
    ...(asset.whenToUse === undefined ? {} : { whenToUse: asset.whenToUse }),
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER,
    source: 'bundled',
    path: SKILL_PATH,
    resourceBase: { kind: 'directory', path: SKILL_DIR },
  }
  const candidate: SkillCandidate = { ...summary, rank: BUNDLED_SKILL_RANK, locator: SKILL_PATH }
  return {
    name: PROVIDER,
    list: () => Promise.resolve([candidate]),
    get: () => Promise.resolve({ ...summary, content: asset.content }),
  }
}

/** Log a startup warning without letting a broken logger change startup. */
function warn(ctx: Context, text: string): void {
  try {
    ctx.logger.warn(text)
  } catch {
    // Swallow logger failures; registration continues without the skill.
  }
}

/** Render an unknown thrown value for a log line. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Contribute the packaged shell-style skill to the session skill catalog.
 *
 * Registration waits for the optional `skills` service and is owned by the
 * plugin fiber, so unloading or disabling the plugin unregisters the provider.
 * A missing or malformed packaged file only skips the contribution; it never
 * fails plugin startup.
 *
 * @param ctx - Plugin context carrying the skill registry.
 */
export function registerApprovalShellSkill(ctx: Context): void {
  let asset: SkillAsset
  try {
    asset = parseSkill(readFileSync(SKILL_PATH, 'utf8').replace(/^\uFEFF/u, ''), SKILL_PATH)
  } catch (error) {
    warn(ctx, `dsh-user-approval: approval shell style skill unavailable: ${message(error)}`)
    return
  }
  ctx.inject(['skills'], (child) => {
    const skills = child.get('skills') as SkillsService | undefined
    if (skills === undefined || typeof skills.registerProvider !== 'function') {
      warn(ctx, 'dsh-user-approval: approval shell style skill not registered: the skills service is unavailable')
      return
    }
    child.effect(
      () => skills.registerProvider(() => createProvider(asset)),
      'dsh-user-approval: approval shell style skill',
    )
  })
}

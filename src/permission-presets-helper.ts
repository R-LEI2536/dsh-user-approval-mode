/**
 * Bridge to `dsh-permission-presets` so `applyMode` can restore a known
 * preset bundle instead of leaving the session in the orphan `custom`
 * state when the user has manually picked a non-workspace-write preset.
 *
 * Only the structural subset of the service we actually use is typed;
 * the cast at the use site in `src/index.ts` calls into the real
 * `permissionPresets` (a sibling `@deepseek-ai/dsh-*` package) when
 * mounted, and the helper is a no-op when it isn't.
 */
import type { Session } from '@deepseek-ai/dsh-session'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'

/** Two-value approval policy enum shipped by `@deepseek-ai/dsh-user-approval`. */
export type ApprovalPolicy = 'ask' | 'never'

/** Minimal structural type for the `ctx.permissionPresets` service we use. */
export interface PermissionPresetsServiceLike {
  readonly names: readonly string[]
  resolve(name: string): { sandbox: SandboxMode; approval: ApprovalPolicy }
  set(session: Session, name: string): void
}

/** Preset match used by `applyMode`: `workspace-write + ask` and friends. */
export const ASK_PRESET_APPROVAL: ApprovalPolicy = 'ask'

/**
 * Pick the preset whose bundle matches `(targetSandbox, 'ask')`. The
 * approval-mode gates all expect approval to surface for non-ask policies,
 * so the natural mode-switch target is always `ask`.
 *
 * Returns undefined when:
 *   - permission-presets isn't mounted (the service arg is undefined)
 *   - no preset in the table pairs the target sandbox with `ask`
 *
 * The second case is reachable only when the deployer customized
 * `sandboxDefaults.<mode>` to a value with no matching preset (e.g.
 * `'read-only'`); the caller falls back to writing `sandbox/mode`
 * directly, and the UI is responsible for showing the orphan state.
 *
 * @param service - the structural handle on `ctx.permissionPresets`, or
 *   undefined when the host didn't mount `dsh-permission-presets`.
 * @param targetSandbox - the sandbox the approval mode wants.
 * @returns the preset name, or undefined when nothing matches.
 */
export function findAskPresetForSandbox(
  service: PermissionPresetsServiceLike | undefined,
  targetSandbox: SandboxMode,
): string | undefined {
  if (service === undefined) return undefined
  for (const name of service.names) {
    const spec = service.resolve(name)
    if (spec.sandbox === targetSandbox && spec.approval === ASK_PRESET_APPROVAL) {
      return name
    }
  }
  return undefined
}

/**
 * Bridge to `dsh-permission-presets` so `applyMode` can restore a known
 * preset bundle instead of leaving the session in the orphan `custom`
 * state when the user has manually picked a non-workspace-write preset.
 *
 * 0.1.5 起 `PermissionPresetService` 由 `@deepseek-ai/dsh-permission-presets`
 * 顶层导出（`packages/interaction/permission-presets/src/index.ts:162`），
 * 这里直接消费正式类型，不再保留本地结构接口 —— 签名漂移会被 typecheck
 * 捕获，运行时不再走 cast 兜底。
 */
import type { PermissionPresetService } from '@deepseek-ai/dsh-permission-presets'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'

/** Approval policy value this helper expects to pair with each preset. */
const ASK_PRESET_APPROVAL = 'ask'

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
 * @param service - the formal handle on `ctx.permissionPresets`, or
 *   undefined when the host didn't mount `dsh-permission-presets`.
 * @param targetSandbox - the sandbox the approval mode wants.
 * @returns the preset name, or undefined when nothing matches.
 */
export function findAskPresetForSandbox(
  service: PermissionPresetService | undefined,
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
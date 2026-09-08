/**
 * Sandbox-escalation helpers used by the smart-mode gate.
 *
 * Background: DSH enforces sandbox via per-call file-effect policy. Tools run
 * under a `SandboxMode` (`read-only` < `workspace-write` < `danger-full-access`).
 * When the model wants to escape the current mode for one call, it retries the
 * same tool with two extra arguments: `sandbox_permissions` (the wider target)
 * and `justification` (a one-sentence reason). The tool body then calls
 * `@deepseek-ai/dsh-sandbox`'s `approveEscalation`, which validates the
 * strictly-wider ladder and prompts the user once.
 *
 * Our rule: any call whose `sandbox_permissions` is strictly wider than the
 * call's effective mode must be approved by the user — even under smart mode,
 * where the classifier would otherwise get a chance to auto-approve. This is
 * the gate's sandbox-escalation short-circuit: we detect the request at
 * `tools/pre-execute` and return `{ kind: 'ask' }` before the classifier
 * ever sees it. DSH's own `approveEscalation` would also prompt the user in
 * the standard preset, but our check stays in effect when the active preset
 * is configured to auto-allow (e.g. `danger-full-access + never`), which is
 * the one configuration where the classifier's verdict could otherwise reach
 * the user unfiltered.
 *
 * Module-local by design: pure parsing + a small comparison table. The
 * ladder mirrors `WIDER_MODES` in `@deepseek-ai/dsh-sandbox` exactly; we
 * re-state it here to keep this module dependency-free of the DSH runtime.
 */
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'

/** Closed ladder mirroring `WIDER_MODES` from `@deepseek-ai/dsh-sandbox`. */
const WIDER_MODES: Readonly<Record<SandboxMode, readonly SandboxMode[]>> = Object.freeze({
  'read-only': Object.freeze<SandboxMode[]>(['workspace-write', 'danger-full-access']),
  'workspace-write': Object.freeze<SandboxMode[]>(['danger-full-access']),
  'danger-full-access': Object.freeze<SandboxMode[]>([]),
})

/** One parsed sandbox-escalation request extracted from tool arguments. */
export interface ParsedSandboxEscalation {
  /** The target mode the model asked the call to run under. */
  readonly requested: SandboxMode
  /** The model's one-sentence reason, exactly as passed in the arguments. */
  readonly justification: string
}

/** Read the sandbox-escalation pair from a tool's parsed arguments. Returns
 *  undefined when neither field is present, or when either field is malformed
 *  (non-string, empty justification, or a target that is not in the closed
 *  vocabulary). Malformed requests are silently ignored: the tool layer will
 *  raise the same errors via `validateEscalationArgs`. */
export function getSandboxEscalation(args: unknown): ParsedSandboxEscalation | undefined {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined
  const record = args as Record<string, unknown>
  const permissions = record.sandbox_permissions
  const justification = record.justification
  if (permissions === undefined && justification === undefined) return undefined
  if (typeof permissions !== 'string') return undefined
  if (typeof justification !== 'string' || justification.trim().length === 0) return undefined
  if (!isSandboxMode(permissions)) return undefined
  return Object.freeze({ requested: permissions, justification })
}

/** Effective sandbox mode for the call: session override ?? composition default. */
export function currentSandboxFor(
  effectiveOverride: SandboxMode | undefined,
  defaultMode: SandboxMode | undefined,
): SandboxMode {
  return effectiveOverride ?? defaultMode ?? 'workspace-write'
}

/** True iff `requested` is strictly wider than `effective` per the closed ladder. */
export function isSandboxEscalation(
  requested: SandboxMode,
  effective: SandboxMode,
): boolean {
  return (WIDER_MODES[effective] ?? []).includes(requested)
}

function isSandboxMode(value: string): value is SandboxMode {
  return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access'
}

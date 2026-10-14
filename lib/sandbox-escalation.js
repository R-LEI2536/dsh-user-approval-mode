/** Closed ladder mirroring `WIDER_MODES` from `@deepseek-ai/dsh-sandbox`. */
const WIDER_MODES = Object.freeze({
    'read-only': Object.freeze(['workspace-write', 'danger-full-access']),
    'workspace-write': Object.freeze(['danger-full-access']),
    'danger-full-access': Object.freeze([]),
});
/** Read the sandbox-escalation pair from a tool's parsed arguments. Returns
 *  undefined when neither field is present, or when either field is malformed
 *  (non-string, empty justification, or a target that is not in the closed
 *  vocabulary). Malformed requests are silently ignored: the tool layer will
 *  raise the same errors via `validateEscalationArgs`. */
export function getSandboxEscalation(args) {
    if (args === null || typeof args !== 'object' || Array.isArray(args))
        return undefined;
    const record = args;
    const permissions = record.sandbox_permissions;
    const justification = record.justification;
    if (permissions === undefined && justification === undefined)
        return undefined;
    if (typeof permissions !== 'string')
        return undefined;
    if (typeof justification !== 'string' || justification.trim().length === 0)
        return undefined;
    if (!isSandboxMode(permissions))
        return undefined;
    return Object.freeze({ requested: permissions, justification });
}
/** Effective sandbox mode for the call: session override ?? composition default. */
export function currentSandboxFor(effectiveOverride, defaultMode) {
    return effectiveOverride ?? defaultMode ?? 'workspace-write';
}
/** True iff `requested` is strictly wider than `effective` per the closed ladder. */
export function isSandboxEscalation(requested, effective) {
    return (WIDER_MODES[effective] ?? []).includes(requested);
}
function isSandboxMode(value) {
    return value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access';
}
//# sourceMappingURL=sandbox-escalation.js.map
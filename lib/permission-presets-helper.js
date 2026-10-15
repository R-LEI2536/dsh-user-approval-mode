/** Approval policy value this helper expects to pair with each preset. */
const ASK_PRESET_APPROVAL = 'ask';
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
export function findAskPresetForSandbox(service, targetSandbox) {
    if (service === undefined)
        return undefined;
    for (const name of service.names) {
        const spec = service.resolve(name);
        if (spec.sandbox === targetSandbox && spec.approval === ASK_PRESET_APPROVAL) {
            return name;
        }
    }
    return undefined;
}
//# sourceMappingURL=permission-presets-helper.js.map
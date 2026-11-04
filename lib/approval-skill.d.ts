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
import type { Context } from '@deepseek-ai/cordis';
/** Skill name this package contributes. Stable: it is the catalog identifier. */
export declare const APPROVAL_SHELL_SKILL = "dsh-approval-shell-style";
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
export declare function registerApprovalShellSkill(ctx: Context): void;
//# sourceMappingURL=approval-skill.d.ts.map
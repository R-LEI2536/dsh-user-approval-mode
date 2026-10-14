/**
 * Built-in danger vocabulary for the smart-mode shell classifier.
 *
 * Same 13 patterns as `dsh-auto-approve/danger-patterns.js`, lifted verbatim.
 * Each source string is compiled into a case-insensitive RegExp at startup
 * (`compileSmartDangerPatterns` in `smart-classifier.ts`); a hit on the
 * shell command text means the call is forwarded to manual review instead
 * of going through the LLM classifier.
 *
 * Dependency-free on purpose: the patterns are part of the safety floor,
 * so this module must never import any host package.
 */
export declare const DEFAULT_SMART_DANGER_PATTERNS: readonly string[];
//# sourceMappingURL=smart-danger-patterns.d.ts.map
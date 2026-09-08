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
export const DEFAULT_SMART_DANGER_PATTERNS: readonly string[] = Object.freeze([
  String.raw`\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+(?:--\s+)?["']?(?:/|~)(?:[^\s"';&|]*)["']?`,
  String.raw`\bdd\b[^\n;&|]*\bof\s*=\s*["']?/dev/`,
  String.raw`\bmkfs(?:\.[a-z0-9_-]+)?\b`,
  String.raw`\bgit(?:\s+(?!push\b)[^\s;&|]+)*\s+push\b[^\n;&|]*(?:--force\b|-f\b|--mirror\b|(?:^|[\s"'])\+[^\s"';&|]+)`,
  String.raw`\b(?:curl|wget)\b[^\n|]*\|\s*(?:/usr/bin/env\s+)?(?:ba|z|da|k)?sh\b`,
  String.raw`\bdrop\s+(?:database|table)\b`,
  String.raw`\btruncate\b`,
  String.raw`(?:^|[\s;&|])(?:shutdown|reboot|halt)\b`,
  String.raw`\bchmod\s+-R\s+777\s+["']?/`,
  String.raw`:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:`,
  String.raw`\bterraform\s+destroy\b`,
  String.raw`\bpulumi\s+destroy\b`,
  '(?=[^\\n]*\\b(?:rm|dd|mkfs(?:\\.[a-z0-9_-]+)?|chmod|chown)\\b)(?=[^\\n]*(?:\\$\\(|`|<\\())',
])

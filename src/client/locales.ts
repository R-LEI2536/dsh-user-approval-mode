/**
 * Approval mode locales.
 *
 * Two namespaces:
 * - `approval` — chip copy (composer toolbar).
 * - `approval-page` — settings page copy (sidebar section + sub-sections +
 *   field labels + CSV-input placeholder + reset button).
 */

// ─── Chip namespace (`approval`) ────────────────────────────────────────────

export type ApprovalKey = keyof typeof en

export const en = {
  'label': 'Approval',
  'mode.off': 'Off',
  'mode.request': 'Request',
  'mode.auto-edit': 'Auto-edit',
  'mode.yolo': 'Yolo',
}

export const zh = {
  'label': '审批',
  'mode.off': '关闭',
  'mode.request': '请求授权',
  'mode.auto-edit': '自动编辑',
  'mode.yolo': 'Yolo',
}

// ─── Settings page namespace (`approval-page`) ──────────────────────────────

export type ApprovalPageKey = keyof typeof enPage

export const enPage = {
  // Sidebar nav label (settings.section slot)
  'nav.label': 'Approval Modes',

  // Page intro
  'intro': 'Configure tool classification, sandbox policy, and the approval dialog template. The default mode and unclassified strategy are set in cordis.yml.',

  // Sub-section headers
  'section.tools': 'Tool classification',
  'section.sandbox': 'Sandbox policy',
  'section.dialog': 'Approval prompt',

  // Field labels
  'field.editTools': 'Edit tools',
  'field.shellTools': 'Shell tools',
  'field.readOnlyTools': 'Read-only tools',
  'field.autoAllowTools': 'Auto-allow tools',
  'field.sandboxRequest': 'Request mode sandbox',
  'field.sandboxAutoEdit': 'Auto-edit mode sandbox',
  'field.sandboxYolo': 'Yolo mode sandbox',
  'field.askReason': 'Approval prompt text',

  // Field descriptions (rendered in ?-icon tooltips)
  'desc.editTools': 'Tools classified as the "edit" family — file modifications. Auto-approved under auto-edit mode.',
  'desc.shellTools': 'Tools classified as the "shell" family — command execution. Always require approval under request and auto-edit modes.',
  'desc.readOnlyTools': 'Tools classified as the "read-only" family. Always allowed regardless of mode.',
  'desc.autoAllowTools': 'Tools that bypass approval entirely, regardless of family. Overlapping with any family list is harmless (redundant, not conflicting).',
  'desc.sandbox': 'Sandbox policy the plugin writes when switching into each mode. The "off" mode restores the composition default instead.',
  'desc.askReason': 'Template shown in the approval dialog. Placeholders: {tool} (tool name), {mode} (current approval mode), {family} (edit | shell | readonly | other).',

  // Sandbox dropdown options (English form, same in en + zh — these are
  // technical identifiers that match the schema values).
  'sandbox.read-only': 'Read-only',
  'sandbox.workspace-write': 'Workspace write',
  'sandbox.danger-full-access': 'Danger full access',

  // CSV input placeholder (one per tool family). Set notation hints that
  // order is irrelevant and duplicates are folded on commit.
  'csv.placeholder': '{write, edit, str_replace_editor}',

  // Reset button (always visible per field)
  'reset.label': 'Reset',

  // askReason help
  'askReason.placeholder': 'approval needed for {tool} under {mode} mode ({family})',
}

export const zhPage = {
  // Sidebar nav label (settings.section slot)
  'nav.label': '审批模式',

  // Page intro
  'intro': '配置工具族分类、各模式 sandbox 策略、审批弹窗文案模板。默认模式与未分类策略写在 cordis.yml 里。',

  // Sub-section headers
  'section.tools': '工具族分类',
  'section.sandbox': 'Sandbox 策略',
  'section.dialog': '审批弹窗',

  // Field labels
  'field.editTools': '编辑族工具',
  'field.shellTools': 'Shell 族工具',
  'field.readOnlyTools': '只读族工具',
  'field.autoAllowTools': '自动放行工具',
  'field.sandboxRequest': 'Request 模式的 sandbox',
  'field.sandboxAutoEdit': 'Auto-edit 模式的 sandbox',
  'field.sandboxYolo': 'Yolo 模式的 sandbox',
  'field.askReason': '审批弹窗文案',

  // Field descriptions
  'desc.editTools': '归为「编辑族」的工具——文件修改类。在 auto-edit 模式下自动放行。',
  'desc.shellTools': '归为「shell 族」的工具——命令执行类。在 request 和 auto-edit 模式下都需要审批。',
  'desc.readOnlyTools': '归为「只读族」的工具。任何模式下都放行。',
  'desc.autoAllowTools': '绕过审批的工具，与族无关。与任何族名单重叠无副作用（冗余但不冲突）。',
  'desc.sandbox': '切到每个模式时插件联动写入的 sandbox 策略。off 模式则恢复为组合默认 sandbox。',
  'desc.askReason': '审批弹窗里显示的文案模板。占位符：{tool}（工具名）、{mode}（当前审批模式）、{family}（edit | shell | readonly | other）。',

  // Sandbox dropdown options — same English form as en, since these are
  // technical identifiers that match the schema values.
  'sandbox.read-only': 'Read-only',
  'sandbox.workspace-write': 'Workspace write',
  'sandbox.danger-full-access': 'Danger full access',

  // CSV input placeholder (same English form as en — set notation is
  // language-neutral).
  'csv.placeholder': '{write, edit, str_replace_editor}',

  // Reset button
  'reset.label': '重置',

  // askReason help
  'askReason.placeholder': '工具 {tool} 需要审批（当前模式：{mode} | 工具类型：{family}）',
}
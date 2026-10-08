/**
 * approval-modes — 自定义审批模式插件（request / auto-edit / yolo / off）。
 *
 * 本插件位于自有空间，不进入官方 packages/。它在
 * `tools/pre-execute` waterfall 上按工具族裁决每个工具调用：需要审批时返回
 * `{ kind: 'ask' }`，由既有审批链（ctx.approval → web 审批弹窗）处理。
 *
 * 四个模式：
 * - `request`  编辑族 + shell 族 + 未分类工具都要审批；只读工具免审。
 * - `auto-edit` 编辑族免审；shell 族 + 未分类工具要审批；只读工具免审。
 * - `yolo`     全部放行（不发起审批），sandbox 联动到配置默认（workspace-write）。
 * - `off`      关闭模式系统，恢复官方原版行为（闸不拦截任何调用）。
 *
 * 只读 git 命令快路径（`readOnlyGitCommands`，默认开）：在 request /
 * auto-edit / smart 下，严格解析后的单条只读 git 调用免审。解析规则与
 * 已知天花板见 src/read-only-git.ts 与
 * docs/adr/0003-read-only-command-fast-path.md。
 *
 * 切换模式（`/approval-mode <mode>`）时联动写入 `sandbox/mode`：
 * request/auto-edit/yolo → 配置默认（默认 workspace-write）；off → 组合默认。
 * 三个旋钮（approval/mode、sandbox/mode、approval/policy）互相独立、last-write-wins。
 *
 * **会话兼容性**：本插件使用内存存储方案（WeakMap），确保会话在 DSH 重启后可以正常加载。
 * 审批模式在 DSH 重启后会恢复为默认值。详见 README.md 的 "Known Limitations" 部分。
 *
 * @module dsh-user-approval
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type { PermissionPresetService } from '@deepseek-ai/dsh-permission-presets'
// DSH 0.1.7 起 `ctx.settings.installSection` 已删除：settings 迁入 profile 插件
// Config —— 设置页可编辑的字段在 schema 上声明 `.volatile()`，值持久化到 profile
// 的 `cordis.patch.yml` user 层并 live 生效；apply 内用 `settings.configure` 声明
// 本插件的 settings 呈现。`ctx.settings` 由 cordis 的 `declare module` 推断，这里
// 只保留 `import type {}` 占位以拉取相关类型增广。
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-commands'
import {
  commandFromArguments,
  compileSmartDangerPatterns,
  createSmartSessionMemory,
  createSmartShellEvaluator,
  type CompiledSmartDangerPattern,
  type SmartEvaluatorConfig,
  type SmartLlmService,
  type SmartDefaultModelService,
  type SmartSessionMemory,
} from './smart-classifier.js'
import { matchReadOnlyGitCommand } from './read-only-git.js'
import { DEFAULT_SMART_CLASSIFIER_PROMPT } from './smart-prompt.js'
import {
  findAskPresetForSandbox,
} from './permission-presets-helper.js'
import {
  getSandboxEscalation,
  currentSandboxFor,
  isSandboxEscalation,
} from './sandbox-escalation.js'

// 扩展 Context 类型声明（仅声明 shell，因为 sandboxPolicy 和 sessions 已在其他包中声明）
declare module '@deepseek-ai/cordis' {
  interface Context {
    shell?: {
      sandboxMode?: SandboxMode
    }
    /** Optional default-model selection service exposed by some hosts. The
     *  smart classifier falls back to its `currentSelection()` when the user
     *  left the provider/model fields blank in the settings page. */
    agentDefaultModel?: SmartDefaultModelService
  }
}

export const name = 'dsh-user-approval'

/** 审批模式闭值。`ask` 留给 approval policy，这里不用。 */
export type ApprovalMode = 'request' | 'auto-edit' | 'smart' | 'yolo' | 'off'
/** 每个可切换的 ApprovalMode，用于校验与广告。 */
export const APPROVAL_MODES: readonly ApprovalMode[] = ['request', 'auto-edit', 'smart', 'yolo', 'off']

/** 工具族分类：编辑、shell、只读、未分类。 */
type ToolFamily = 'edit' | 'shell' | 'readonly' | 'other'

// 使用 WeakMap 存储会话审批模式（内存方案）
// DSH 重启后审批模式会恢复为默认值，但会话可以正常加载
const sessionModes = new WeakMap<Session, ApprovalMode>()

/** 插件配置。全部带默认值，部署方可在 cordis.yml 覆盖。 */
export interface Config {
  /** 新会话的默认模式；`approval/mode` 事件缺席时即此值。默认 `off`。 */
  default?: ApprovalMode
  /** 编辑族工具名（默认 write/edit/str_replace_editor/update_goal）。 */
  editTools?: string[]
  /** shell 族工具名（默认 bash/pwsh 及原始变体）。 */
  shellTools?: string[]
  /** 只读工具名（默认 read/glob/grep/read_image/list_directory/todo_write + reme_search/list_agents/job_list/get_goal）；任何模式下免审。 */
  readOnlyTools?: string[]
  /** 永远免审的控制/编排工具（默认 ask_user_question/exit_plan_mode + job_output/skill/subagent/present/wait_agent/send_message/team_task_update/team_task_list）。 */
  autoAllowTools?: string[]
  /** 未分类工具的策略：`ask`（默认，fail-safe）或 `allow`。 */
  unclassified?: 'ask' | 'allow'
  /** 只读 git 命令免审快路径的总开关（默认 true）。严格解析后的单条只读
   *  git 调用在 request/auto-edit/smart 下免审；置 false 恢复「shell 一律弹窗」。 */
  readOnlyGitCommands?: boolean
  /** 切到各模式时联动写入的 sandbox 默认；`off` 写组合默认。 */
  sandboxDefaults?: Partial<Record<'request' | 'auto-edit' | 'smart' | 'yolo', 'read-only' | 'workspace-write' | 'danger-full-access'>>
  /** 审批 ask 的 reason 模板，支持 {tool}/{mode}/{family} 插值。 */
  askReason?: string
  /** Smart 分类器使用的 LLM provider。null = 继承 host 默认。 */
  smartProvider?: string | null
  /** Smart 分类器使用的 LLM model。null = 继承 host 默认。 */
  smartModel?: string | null
  /** 追加到内置 13 条危险清单之后的正则；命中直接转人工。 */
  smartExtraDangerPatterns?: string[]
  /** 整组替换内置 13 条危险清单。`null`（默认）保留内置；非 null 数组完全替换。 */
  smartDangerPatterns?: string[] | null
  /** 是否启用会话记忆（同 session 内同命令 TTL 内自动放行）。 */
  smartSessionMemory?: boolean
  /** 会话记忆 TTL（毫秒），默认 30 分钟。 */
  smartSessionMemoryTtlMs?: number
  /** 单次 LLM 分类调用的超时（毫秒），默认 15 秒。 */
  smartTimeoutMs?: number
  /** 分类器系统提示词；非空字符串覆盖内置 prompt。 */
  smartClassifierPrompt?: string
}

/**
 * 运行时 Config：8 个设置页可编辑字段包在 `Volatile<T>` 引用里（live，随 profile
 * user 层更新），其余 8 个部署方-only 字段为启动时定值的普通值。类型镜像
 * `Config` schema（含 `.volatile()` 链）的校验输出，apply 按此形状读配置。
 */
export interface VolatileConfig {
  default: ApprovalMode
  editTools: Volatile<string[]>
  shellTools: Volatile<string[]>
  readOnlyTools: Volatile<string[]>
  autoAllowTools: Volatile<string[]>
  unclassified: 'ask' | 'allow'
  readOnlyGitCommands: boolean
  sandboxDefaults: Volatile<Partial<Record<'request' | 'auto-edit' | 'smart' | 'yolo', 'read-only' | 'workspace-write' | 'danger-full-access'>>>
  askReason: Volatile<string>
  smartProvider: Volatile<string | null>
  smartModel: Volatile<string | null>
  smartExtraDangerPatterns: string[]
  smartDangerPatterns: string[] | null
  smartSessionMemory: boolean
  smartSessionMemoryTtlMs: number
  smartTimeoutMs: number
  smartClassifierPrompt: string
}

export const Config: Schema<Config, VolatileConfig> = Schema.object({
  default: Schema.union([...APPROVAL_MODES] as ApprovalMode[])
    .default('off')
    .description('The approval mode assigned to new sessions. Each session can still be switched at runtime via the composer chip.'),
  editTools: Schema.array(Schema.string())
    .default(['write', 'edit', 'str_replace_editor', 'update_goal'])
    .description('Tools classified as the "edit" family — file modifications. Auto-approved under auto-edit mode.')
    .volatile(),
  shellTools: Schema.array(Schema.string())
    .default(['bash', 'pwsh', 'tool:bash', 'tool:pwsh'])
    .description('Tools classified as the "shell" family — command execution. Always require approval under request and auto-edit modes.')
    .volatile(),
  readOnlyTools: Schema.array(Schema.string())
    .default(['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'reme_search', 'list_agents', 'job_list', 'get_goal'])
    .description('Tools classified as the "read-only" family. Always allowed regardless of mode.')
    .volatile(),
  autoAllowTools: Schema.array(Schema.string())
    .default(['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'present', 'wait_agent', 'send_message', 'team_task_update', 'team_task_list'])
    .description('Tools that bypass approval entirely, regardless of family. Overlapping with any family list is harmless (redundant, not conflicting).')
    .volatile(),
  unclassified: Schema.union(['ask', 'allow'] as ('ask' | 'allow')[])
    .default('ask')
    .description('Strategy for tools that fall in no family: "ask" (fail-safe, default) or "allow" (permissive).'),
  readOnlyGitCommands: Schema.boolean()
    .default(true)
    .description('Auto-allow a single strictly-parsed read-only git command (git status, git log, git diff, …) in the shell family instead of prompting. Set false to restore "shell always asks" under request and auto-edit. Deployer-only; see docs/adr/0003-read-only-command-fast-path.md.'),
  sandboxDefaults: Schema.dict(Schema.union(['read-only', 'workspace-write', 'danger-full-access'] as ('read-only' | 'workspace-write' | 'danger-full-access')[]))
    .default({
      request: 'workspace-write',
      'auto-edit': 'workspace-write',
      yolo: 'workspace-write',
    })
    .description('Sandbox policy the plugin writes when switching into each mode. The "off" mode restores the composition default instead.')
    .volatile(),
  askReason: Schema.string()
    .default('approval needed for {tool} under {mode} mode ({family}); read-only browsing should use read/glob/list_directory instead of shell')
    .description('Template shown in the approval dialog. Placeholders: {tool} (tool name), {mode} (current approval mode), {family} (edit | shell | readonly | other).')
    .volatile(),
  smartProvider: Schema.union([Schema.string().min(1), Schema.const(null)]).default(null)
    .description('LLM provider route for the smart-mode shell classifier. Null inherits the host default-model selection.')
    .volatile(),
  smartModel: Schema.union([Schema.string().min(1), Schema.const(null)]).default(null)
    .description('LLM model id for the smart-mode shell classifier. Null inherits the host default-model selection.')
    .volatile(),
  smartExtraDangerPatterns: Schema.array(Schema.string()).default([])
    .description('Append-only danger regex patterns the smart classifier checks before the LLM. Case-insensitive; compiled at startup.'),
  smartDangerPatterns: Schema.union([Schema.array(Schema.string()), Schema.const(null)]).default(null)
    .description('Replace the built-in 13 danger patterns entirely. Null (default) keeps the built-ins; a non-null array replaces them with the configured set. Use smartExtraDangerPatterns to APPEND without replacing. Deployer-only; not exposed in the settings page.'),
  smartSessionMemory: Schema.boolean().default(true)
    .description('Enable per-session memory that auto-approves a previously-classified shell call within the TTL window.'),
  smartSessionMemoryTtlMs: Schema.number().step(1).min(1).max(2_147_483_647).default(1_800_000)
    .description('TTL for a remembered shell approval, in milliseconds. Default 30 minutes.'),
  smartTimeoutMs: Schema.number().step(1).min(1).max(2_147_483_647).default(15_000)
    .description('Hard timeout for one classifier LLM call, in milliseconds. Any timeout falls back to manual review.'),
  smartClassifierPrompt: Schema.string().min(1).default(DEFAULT_SMART_CLASSIFIER_PROMPT)
    .description('System prompt for the smart classifier. Defaults to the built-in DEFAULT_SMART_CLASSIFIER_PROMPT (verbatim from dsh-auto-approve); any non-empty string overrides.'),
})

/**
 * Get the approval mode for a session from memory.
 * @param session - The session to query.
 * @param defaultMode - The default mode to return if the session never switched.
 * @returns The session's mode, or defaultMode if not set.
 */
export function getApprovalMode(session: Session, defaultMode: ApprovalMode): ApprovalMode {
  return sessionModes.get(session) ?? defaultMode
}

/**
 * Set the approval mode for a session in memory.
 * @param session - The session to update.
 * @param mode - The mode to set.
 */
export function setApprovalMode(session: Session, mode: ApprovalMode): void {
  sessionModes.set(session, mode)
}

export function apply(ctx: Context, config: VolatileConfig): void {
  // 本插件自带 settings.section 页面（见 src/client），`auto: false` 抑制 settings
  // 服务为 volatile Config 自动生成页面（rc.2 官方范式，ui-chat/ui-theme 同款）。
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })

  // Live settings thunk：volatile 引用由运行时随 profile user 层更新，每次调用
  // 从 `config.<field>.get()` 装配一张纯快照，让设置页编辑在下一次
  // `tools/pre-execute` 就生效（无需重启）。数组/对象字段展开拷贝，剥离
  // `VolatileSnapshot` 的 readonly 包装；下游调用点读到的仍是普通 Config。
  const cfgThunk = (): Config => ({
    default: config.default,
    editTools: [...config.editTools.get()],
    shellTools: [...config.shellTools.get()],
    readOnlyTools: [...config.readOnlyTools.get()],
    autoAllowTools: [...config.autoAllowTools.get()],
    unclassified: config.unclassified,
    readOnlyGitCommands: config.readOnlyGitCommands,
    sandboxDefaults: { ...config.sandboxDefaults.get() },
    askReason: config.askReason.get(),
    smartProvider: config.smartProvider.get(),
    smartModel: config.smartModel.get(),
    smartExtraDangerPatterns: config.smartExtraDangerPatterns,
    smartDangerPatterns: config.smartDangerPatterns,
    smartSessionMemory: config.smartSessionMemory,
    smartSessionMemoryTtlMs: config.smartSessionMemoryTtlMs,
    smartTimeoutMs: config.smartTimeoutMs,
    smartClassifierPrompt: config.smartClassifierPrompt,
  })

  // 组合默认 sandbox：无 session 覆盖时沙箱旋钮应落回的值（off 联动写回它）。
  // 使用 ctx.get() 而不是 inject 声明，避免fiber启动依赖
  //
  // DSH 0.1.2-alpha.3 起 `effectiveSandboxMode(events)` 从
  // `@deepseek-ai/dsh-sandbox-policy` 导出中移除（迁到 session-projection 单元）；
  // "session 最后一个 sandbox/mode" 现在走 `ctx.sandboxPolicy.overrideOf(session)`，
  // 语义等价：取该 session 日志里最后一个 `sandbox/mode` 事件，没有则 undefined。
  // 0.1.5 起 `SandboxPolicyService` 在 `@deepseek-ai/dsh-sandbox-policy` 顶层导出，
  // 这里直接用正式类型，不再 `as` cast —— 签名漂移会在 typecheck 阶段被捕获。
  const sandboxPolicy: SandboxPolicyService | undefined = ctx.get('sandboxPolicy')
  const shell = ctx.get('shell') as { sandboxMode?: string } | undefined
  const compositionDefaultSandbox = sandboxPolicy?.defaultMode ?? shell?.sandboxMode ?? 'workspace-write'

  const effectiveMode = (session: Session): ApprovalMode => getApprovalMode(session, cfgThunk().default ?? 'off')

  const familyOf = (toolName: string): ToolFamily => {
    const cfg = cfgThunk()
    if (cfg.editTools?.includes(toolName)) return 'edit'
    if (cfg.shellTools?.includes(toolName)) return 'shell'
    if (cfg.readOnlyTools?.includes(toolName)) return 'readonly'
    return 'other'
  }

  const needsAsk = (mode: ApprovalMode, family: ToolFamily): boolean => {
    const unclassified = cfgThunk().unclassified ?? 'ask'
    if (mode === 'request') return family === 'edit' || family === 'shell' || (family === 'other' && unclassified === 'ask')
    if (mode === 'auto-edit') return family === 'shell' || (family === 'other' && unclassified === 'ask')
    if (mode === 'smart') return family === 'other' && unclassified === 'ask'
    return false // off / yolo：全放行
  }

  // Logger helper for smart-mode decisions. Wrapped in try/catch because a
  // broken logger must never change an approval outcome (mirrors the
  // safety posture of `dsh-auto-approve`'s `logDecision`). The plugin tag
  // and `ask|allow` vocabulary match the gate's public decision kinds so
  // deployers can grep the dsh log for every prompt the smart classifier
  // produced.
  const logSmartDecision = (decision: 'ask' | 'allow', detail: string): void => {
    try {
      ctx.logger.info(`[dsh-user-approval[smart]] decision=${decision} ${detail}`)
    } catch {
      // Swallow logger failures; the decision has already been computed.
    }
  }

  // Model suffix appended to a classification decision line when the LLM
  // classifier actually ran. The selection rides the evaluator verdict, so
  // each classification produces exactly one log line with the effective
  // model id (including host-default inheritance).
  const modelSuffix = (selection?: { provider: string; model: string }): string =>
    selection === undefined ? '' : ` model=${selection.model} provider=${selection.provider}`

  // Logger for the read-only git fast-path. Same posture as
  // `logSmartDecision` (a broken logger must never change an outcome), but a
  // distinct tag so it is greppable on its own and does not disturb the
  // existing `[dsh-user-approval[smart]]` decision lines.
  const logReadOnlyGitAllow = (subcommand: string): void => {
    try {
      ctx.logger.info(`[dsh-user-approval[read-only-git]] decision=allow detail=${subcommand}`)
    } catch {
      // Swallow logger failures; the decision has already been computed.
    }
  }

  // ── Smart-mode evaluator lifecycle ────────────────────────────────────────
  // The classifier is only useful when smart mode is in play, but the
  // evaluator state (compiled patterns, session memory, AbortController)
  // is cheap to keep alive regardless. Plugin unload aborts in-flight
  // LLM calls via `lifetimeSignal` and drains the active set.
  const lifetimeController = new AbortController()
  const lifetimeSignal = lifetimeController.signal
  const smartMemory: SmartSessionMemory = createSmartSessionMemory(1_800_000)
  const activeEvaluations = new Set<Promise<unknown>>()

  const smartEvaluator = (exec: { name: string; arguments: unknown }, session: Session) => {
    const cfg = cfgThunk()
    const smartCfg: SmartEvaluatorConfig = {
      smartExtraDangerPatterns: cfg.smartExtraDangerPatterns ?? [],
      smartDangerPatterns: cfg.smartDangerPatterns ?? null,
      smartSessionMemory: cfg.smartSessionMemory ?? true,
      smartSessionMemoryTtlMs: cfg.smartSessionMemoryTtlMs ?? 1_800_000,
      smartTimeoutMs: cfg.smartTimeoutMs ?? 15_000,
      smartClassifierPrompt: cfg.smartClassifierPrompt ?? DEFAULT_SMART_CLASSIFIER_PROMPT,
      smartProvider: cfg.smartProvider ?? null,
      smartModel: cfg.smartModel ?? null,
      readOnlyGitCommands: cfg.readOnlyGitCommands ?? true,
    }
    const patterns = compileSmartDangerPatterns(smartCfg.smartDangerPatterns, smartCfg.smartExtraDangerPatterns)
    // Cast to our narrower `SmartLlmService` — the host's LlmRuntime.stream
    // signature is structurally compatible, but TypeScript's `messages` is
    // mutable there and `readonly` here. We never mutate downstream.
    const llm = ctx.get('llm') as SmartLlmService | undefined
    const defaultModel = ctx.get('agentDefaultModel')
    const task = createSmartShellEvaluator({
      config: smartCfg,
      patterns,
      llm,
      defaultModel,
      memory: smartMemory,
      lifetimeSignal,
    })(exec, session)
    const tracked = Promise.resolve().then(() => task).finally(() => activeEvaluations.delete(tracked))
    activeEvaluations.add(tracked)
    return tracked
  }

  ctx.effect(() => {
    return async () => {
      // Plugin unload: stop new classifications, wait for in-flight ones,
      // then drop the per-session memory. After this returns the resolver
      // sees `lifetimeSignal.aborted === true` and short-circuits to ask.
      lifetimeController.abort(new Error('dsh-user-approval-mode[smart]: plugin unloaded'))
      await Promise.allSettled([...activeEvaluations])
    }
  }, 'dsh-user-approval-mode[smart]: drain in-flight classifiers')

  // ── 闸：每个工具调用分发前裁决 ─────────────────────────────────────────
  // 先 next() 取下游裁决再决定：下游 deny/ask 保持，只有下游 allow 且本模式
  // 要求弹时才升级为 ask；off/yolo 原样放行（= 官方原版）。
  // Smart 模式下 shell 族在闸里额外走 5 步裁决（详见 smart-classifier.ts）。
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    if (decision.kind !== 'allow') return decision
    const agent = exec.agent
    if (agent === undefined) return decision
    // 在裁决点重新读取最新 settings，而不是 apply() 启动时的快照。
    const cfg = cfgThunk()
    if (cfg.autoAllowTools?.includes(exec.name)) return decision
    const mode = effectiveMode(agent.session)
    const family = familyOf(exec.name)
    if (family === 'readonly') return decision

    // 只读 git 快路径：request / auto-edit 下把「严格解析后的单条只读 git
    // 调用」当作免审。开关关闭时不解析。smart 分支不在这里判——快路径在
    // evaluator 内的危险清单之后，才能保证危险清单是硬地板（见
    // docs/adr/0003-read-only-command-fast-path.md）。
    const gitSubcommand = family === 'shell' && mode !== 'smart' && cfg.readOnlyGitCommands !== false
      ? matchReadOnlyGitCommand(commandFromArguments(exec.arguments))
      : undefined

    // Smart 模式 + shell 族：先做提权拦截，再走裁决流水线（危险清单
    // → 只读 git 快路径 → 会话记忆 → LLM 分类器 → fail-safe）。提权强制
    // ask，分类器与快路径都不会代决 sandbox 升级——即使下游 preset 配成
    // auto-allow。
    if (mode === 'smart' && family === 'shell') {
      const escalation = getSandboxEscalation(exec.arguments)
      if (escalation !== undefined) {
        const effective = currentSandboxFor(
          sandboxPolicy?.overrideOf(agent.session),
          compositionDefaultSandbox as SandboxMode | undefined,
        )
        if (isSandboxEscalation(escalation.requested, effective)) {
          logSmartDecision('ask', `detail=sandbox-escalation ${effective}->${escalation.requested}`)
          return {
            kind: 'ask',
            reason: `sandbox 升级 ${effective} → ${escalation.requested}，需用户确认（${escalation.justification}）`,
          }
        }
      }
      const verdict = await smartEvaluator(exec, agent.session)
      if (verdict.kind === 'allow') {
        if (verdict.source === 'read-only-git') {
          logReadOnlyGitAllow(verdict.subcommand)
          return { kind: 'allow' }
        }
        logSmartDecision('allow', `detail=${verdict.source}${modelSuffix(verdict.selection)}`)
        return { kind: 'allow' }
      }
      logSmartDecision('ask', `detail=${verdict.detail}${modelSuffix(verdict.selection)}`)
      return {
        kind: 'ask',
        reason: (cfg.askReason ?? 'approval needed for {tool} under {mode} mode ({family})')
          .replace('{tool}', exec.name)
          .replace('{mode}', mode)
          .replace('{family}', family)
          + (verdict.detail ? ` [smart: ${verdict.detail}]` : ''),
      }
    }

    if (gitSubcommand !== undefined) {
      logReadOnlyGitAllow(gitSubcommand)
      return { kind: 'allow' }
    }

    if (!needsAsk(mode, family)) return decision
    return {
      kind: 'ask',
      reason: (cfg.askReason ?? 'approval needed for {tool} under {mode} mode ({family})')
        .replace('{tool}', exec.name)
        .replace('{mode}', mode)
        .replace('{family}', family),
    }
  })

  // ── 切换：写 mode + 联动写 sandbox ───────────────────────────────────────
  // Permission-presets (sibling @deepseek-ai/dsh-* package) bundles
  // (sandbox, approval-policy) into named presets. When mounted, a
  // manual preset pick (e.g. user picked `danger-full-access`) leaves an
  // `approval/policy: never` in the session log; switching our approval
  // mode rewrites the sandbox to `workspace-write`, leaving the pair
  // mismatched → permission-presets' derive falls back to `custom`.
  //
  // For non-off modes we delegate the bundle write to permission-presets
  // when a matching preset exists; the off mode keeps direct sandbox
  // writes (no preset bundle — off is "I don't care about presets").
  //
  // The service handle is resolved LAZILY at every applyMode call,
  // not captured at apply() time: cordis does not guarantee that
  // dsh-permission-presets has finished mounting before our plugin's
  // `apply()` runs, and a top-level `ctx.get()` would freeze `undefined`
  // for the rest of this plugin's lifetime.
  const applyModeSandboxChange = (session: Session, mode: ApprovalMode, sandbox: SandboxMode): void => {
    if (mode === 'off') {
      setSandboxMode(session, sandbox)
      return
    }
    // 0.1.5 起 `PermissionPresetService` 在 `@deepseek-ai/dsh-permission-presets`
    // 顶层导出（`packages/interaction/permission-presets/src/index.ts:162`），
    // 用正式类型替换本地结构接口；签名漂移会被 typecheck 捕获，运行时不再裸调。
    const permissionPresets: PermissionPresetService | undefined = ctx.get('permissionPresets')
    const presetName = findAskPresetForSandbox(permissionPresets, sandbox)
    if (presetName !== undefined && permissionPresets !== undefined) {
      permissionPresets.set(session, presetName)
      return
    }
    // No matching preset (permission-presets missing or sandbox doesn't
    // pair with `ask` in any preset — e.g. user customized
    // sandboxDefaults.smart to `read-only`). Fall back to writing
    // sandbox alone; the approval-policy may then be in any state the
    // user left it. The orphan state is the deployer's call.
    setSandboxMode(session, sandbox)
  }

  const applyMode = (session: Session, mode: ApprovalMode): { previous: ApprovalMode; sandboxChanged: boolean } => {
    const previous = effectiveMode(session)
    setApprovalMode(session, mode)
    const sandboxDefaults = cfgThunk().sandboxDefaults ?? { request: 'workspace-write', 'auto-edit': 'workspace-write', smart: 'workspace-write', yolo: 'workspace-write' }
    const sandbox = mode === 'off'
      ? compositionDefaultSandbox
      : (sandboxDefaults[mode as 'request' | 'auto-edit' | 'smart' | 'yolo'] ?? 'workspace-write')
    const sandboxChanged = sandboxPolicy?.overrideOf(session) !== sandbox
    if (sandboxChanged) applyModeSandboxChange(session, mode, sandbox as SandboxMode)
    return { previous, sandboxChanged }
  }

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      name: 'approval-mode',
      description: 'Switch the approval mode (request | auto-edit | smart | yolo | off)',
      input: { hint: '<mode>' },
      handler: ({ agent, rawInput }) => {
        const trimmed = rawInput.trim()
        if (trimmed === '') {
          return { kind: 'success', text: `current approval mode: ${effectiveMode(agent.session)} (available: ${APPROVAL_MODES.join(', ')})` }
        }
        const mode = trimmed as ApprovalMode
        if (!APPROVAL_MODES.includes(mode)) {
          return { kind: 'error', text: `unknown approval mode "${mode}" (available: ${APPROVAL_MODES.join(', ')})` }
        }
        applyMode(agent.session, mode)
        return { kind: 'success', text: `approval mode switched to ${mode}` }
      }
    })
  })
}

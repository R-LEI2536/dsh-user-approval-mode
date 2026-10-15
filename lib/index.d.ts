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
import type { Context, Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { Session } from '@deepseek-ai/dsh-session';
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox';
import { type SmartDefaultModelService } from './smart-classifier.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        shell?: {
            sandboxMode?: SandboxMode;
        };
        /** Optional default-model selection service exposed by some hosts. The
         *  smart classifier falls back to its `currentSelection()` when the user
         *  left the provider/model fields blank in the settings page. */
        agentDefaultModel?: SmartDefaultModelService;
    }
}
export declare const name = "dsh-user-approval";
/** 审批模式闭值。`ask` 留给 approval policy，这里不用。 */
export type ApprovalMode = 'request' | 'auto-edit' | 'smart' | 'yolo' | 'off';
/** 每个可切换的 ApprovalMode，用于校验与广告。 */
export declare const APPROVAL_MODES: readonly ApprovalMode[];
/** 插件配置。全部带默认值，部署方可在 cordis.yml 覆盖。 */
export interface Config {
    /** 新会话的默认模式；`approval/mode` 事件缺席时即此值。默认 `off`。 */
    default?: ApprovalMode;
    /** 编辑族工具名（默认 write/edit/str_replace_editor/update_goal）。 */
    editTools?: string[];
    /** shell 族工具名（默认 bash/pwsh 及原始变体）。 */
    shellTools?: string[];
    /** 只读工具名（默认 read/glob/grep/read_image/list_directory/todo_write + reme_search/list_agents/job_list/get_goal）；任何模式下免审。 */
    readOnlyTools?: string[];
    /** 永远免审的控制/编排工具（默认 ask_user_question/exit_plan_mode + job_output/skill/subagent/present/wait_agent/send_message/team_task_update/team_task_list）。 */
    autoAllowTools?: string[];
    /** 未分类工具的策略：`ask`（默认，fail-safe）或 `allow`。 */
    unclassified?: 'ask' | 'allow';
    /** 只读 git 命令免审快路径的开关（默认 true，设置页可改）。严格解析后的
     *  单条只读 git 调用在 request/auto-edit/smart 下免审；关闭则恢复
     *  「shell 一律弹窗」。 */
    readOnlyGitCommands?: boolean;
    /** 切到各模式时联动写入的 sandbox 默认；`off` 写组合默认。 */
    sandboxDefaults?: Partial<Record<'request' | 'auto-edit' | 'smart' | 'yolo', 'read-only' | 'workspace-write' | 'danger-full-access'>>;
    /** 审批 ask 的 reason 模板，支持 {tool}/{mode}/{family} 插值。 */
    askReason?: string;
    /** Smart 分类器使用的 LLM provider。null = 继承 host 默认。 */
    smartProvider?: string | null;
    /** Smart 分类器使用的 LLM model。null = 继承 host 默认。 */
    smartModel?: string | null;
    /** 追加到内置 13 条危险清单之后的正则；命中直接转人工。 */
    smartExtraDangerPatterns?: string[];
    /** 整组替换内置 13 条危险清单。`null`（默认）保留内置；非 null 数组完全替换。 */
    smartDangerPatterns?: string[] | null;
    /** 是否启用会话记忆（同 session 内同命令 TTL 内自动放行）。 */
    smartSessionMemory?: boolean;
    /** 会话记忆 TTL（毫秒），默认 30 分钟。 */
    smartSessionMemoryTtlMs?: number;
    /** 单次 LLM 分类调用的超时（毫秒），默认 15 秒。 */
    smartTimeoutMs?: number;
    /** 分类器系统提示词；非空字符串覆盖内置 prompt。 */
    smartClassifierPrompt?: string;
}
/**
 * 运行时 Config：9 个设置页可编辑字段包在 `Volatile<T>` 引用里（live，随 profile
 * user 层更新），其余 8 个部署方-only 字段为启动时定值的普通值。类型镜像
 * `Config` schema（含 `.volatile()` 链）的校验输出，apply 按此形状读配置。
 */
export interface VolatileConfig {
    default: ApprovalMode;
    editTools: Volatile<string[]>;
    shellTools: Volatile<string[]>;
    readOnlyTools: Volatile<string[]>;
    autoAllowTools: Volatile<string[]>;
    unclassified: 'ask' | 'allow';
    readOnlyGitCommands: Volatile<boolean>;
    sandboxDefaults: Volatile<Partial<Record<'request' | 'auto-edit' | 'smart' | 'yolo', 'read-only' | 'workspace-write' | 'danger-full-access'>>>;
    askReason: Volatile<string>;
    smartProvider: Volatile<string | null>;
    smartModel: Volatile<string | null>;
    smartExtraDangerPatterns: string[];
    smartDangerPatterns: string[] | null;
    smartSessionMemory: boolean;
    smartSessionMemoryTtlMs: number;
    smartTimeoutMs: number;
    smartClassifierPrompt: string;
}
export declare const Config: Schema<Config, VolatileConfig>;
/**
 * Get the approval mode for a session from memory.
 * @param session - The session to query.
 * @param defaultMode - The default mode to return if the session never switched.
 * @returns The session's mode, or defaultMode if not set.
 */
export declare function getApprovalMode(session: Session, defaultMode: ApprovalMode): ApprovalMode;
/**
 * Set the approval mode for a session in memory.
 * @param session - The session to update.
 * @param mode - The mode to set.
 */
export declare function setApprovalMode(session: Session, mode: ApprovalMode): void;
export declare function apply(ctx: Context, config: VolatileConfig): void;
//# sourceMappingURL=index.d.ts.map
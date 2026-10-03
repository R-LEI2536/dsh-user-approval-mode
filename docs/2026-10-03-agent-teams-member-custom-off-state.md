# Agent Teams 成员会话显示「沙盒 Custom / 审批 关闭」的成因分析

**日期**: 2026-10-03
**宿主基线**: `deepseek-harness` = `dsh-v0.2.0-rc.2`（HEAD `639ed01539`）
**插件基线**: `dsh-user-approval-mode` 0.7.x 线（分析时 `package.json` 为 `0.7.0`，HEAD `d765fb6069`；`0.7.0` 未单独打 tag，随 `v0.7.1` 并入 `main`）
**分析范围**: Agent Teams 成员（委派子会话）在 Web composer 里显示的两个芯片
**结论**: ✅ **设计如此，不是 bug**——两个显示分属两个不同 owner，且都不是可配置项

---

## 一、现象

在 Agent Teams profile 下由 Lead 生成成员后，点进成员会话（`openTeammate` → 以 `mode: 'continuable'` 打开子会话），composer 工具行里两个芯片显示为：

| 芯片 | 归属 | 显示值 |
| --- | --- | --- |
| 访问模式 / 权限芯片 | 宿主 `dsh-permission-presets` | `Custom` |
| 审批模式芯片 | 本插件 `dsh-user-approval-mode` | `关闭`（`off`） |

用户侧感受是「成员的沙盒是 custom、审批是关闭，而且我没法去改它」。

---

## 二、结论

1. **`Custom` 是宿主权限预设的派生状态，不是 bug。** 成员是委派子会话：委派边界把 approval 策略固定为 `never`，sandbox 只继承 Lead 的显式覆盖值（Lead 没覆盖就落回组合默认 `workspace-write`）。默认预设表里没有 `(workspace-write, never)` 这一组，`derive()` 便返回保留值 `custom`。宿主官方文档对这一行为有明文描述。
2. **`关闭` 是本插件的默认模式，不是 bug。** `default: off` 是本插件 `cordis.patch.yml` 的部署默认，且模式按会话存在进程内存里、不继承，所以新生的成员会话读到 `off`。
3. **「改不了」是设计边界。** 两者都是**按会话派生的运行时状态**，不是设置项：宿主 `Settings → Permission` 的默认预设只作用于新建的顶层会话；本插件的 `default` 是 deployer-only，设置页改不到。成员会话要改，只能在它自己的 composer 里用芯片/命令切，且要求该会话有活 agent、输入栏非只读。

---

## 三、机制：「Custom」从哪来

链路（宿主 `@deepseek-ai/dsh-subagent`）：

1. Lead 调 `spawn_teammate` → 走 continuable 委派路径，在**首次 await 前**捕获策略：
   `captureDelegatedPolicyOverrides(parent)` 产出
   - `sandboxMode` = Lead 会话的**显式** `sandbox/mode` 覆盖值（没改过则为 `undefined`，绝不取组合默认或一次性授权）
   - `approvalPolicy` = `'never'`（只要 approval 能力已组合）
   - `permissionPreset` = 仅当 Lead 处于 `auto` / `danger-full-access` 时才有值
2. 子会话创建窗口内 `appendDelegatedPolicyOverrides(child.session, …)` 把这些写进子日志（`source: 'delegation'`），使子会话的有效策略可仅凭自身日志重建。
3. 权限预设侧 `derive(state)`：
   - `sandbox = state.sandbox ?? ctx.shell.sandboxMode`
   - `approval = state.approval ?? ctx.approval.config.policy ?? 'ask'`
   - 逐条比对预设表；默认表只有
     `workspace-write` = `(workspace-write, ask)`、
     `danger-full-access` = `(danger-full-access, never)`
4. 子会话拿到 `(workspace-write, never)`（Lead 未覆盖 sandbox 时）→ 无任何预设匹配 → 返回 `CUSTOM_PRESET = 'custom'`。
5. 客户端芯片把 `currentValue` 交给 `optionOf('custom')`，得到字面量 `name: 'Custom'`；中文词典没有 `custom` 键，所以中文界面里也显示英文 `Custom`。

宿主文档原文（`docs/subsystems/subagent.md:459`）：

> Read Only and Workspace Write retain the inherited sandbox override plus `approval: never`, so unmatched bundles remain `custom`.

---

## 四、机制：「关闭」从哪来

本插件（`dsh-user-approval-mode`）：

- `Config.default` 默认 `'off'`（`cordis.patch.yml` 也显式写 `default: off`）。
- 模式用进程内 `WeakMap<Session, ApprovalMode>` 存储，**按会话、不继承**；子会话从未切过，`effectiveMode()` 即返回 `default`。
- 芯片 `ApprovalModeChip` 挂载时向该会话执行 `/approval-mode`（无参）取当前模式；解析失败/未命中时回退 `'off'`。
- 中文词典 `'mode.off': '关闭'`，于是芯片显示「关闭」。

注意本插件的 `off` 语义：闸完全放行（等价 DSH 原版行为），并且**只直接写 `sandbox/mode`、不走预设 bundle**——这正是它把会话留在 `custom` 孤儿态的直接原因。本插件 README 的 "Permission-presets interaction" 一节已记录该交互。

---

## 五、为什么你改不了

| 想改的东西 | 对应设置 | 为什么对成员无效 |
| --- | --- | --- |
| 成员的权限预设（Custom） | 宿主 `Settings → Permission` 的默认预设 | 该默认值只在**新建顶层会话**时写入（`pinInitialPermission` 的「全空且未 seeded」分支）。成员日志里已有 `source: 'delegation'` 的 `approval/policy: never`，不满足该分支；派生结果仍是 `custom`，不会被默认值覆盖。 |
| 成员的审批模式（关闭） | 本插件 `default` | `default` 是 deployer-only（只在 `cordis.yml` 配），设置页不暴露；成员也不会继承 Lead 的模式。 |
| 就地切换成员 | composer 两个芯片 | 芯片确实会写该会话自己的日志，但前提是**该会话有活 agent、composer 非只读**。只读 composer（一次性子会话 / 父会话离线）或未激活的成员，输入行被锁，芯片点不动。 |

---

## 六、什么时候会出现，什么时候不会

`Custom` 是否出现，取决于 **Lead 会话当时的预设**（因为 sandbox 由 Lead 覆盖值继承）：

| Lead 预设 | 成员继承到的组合 | 成员芯片显示 |
| --- | --- | --- |
| `workspace-write`（默认） | `(workspace-write, never)` | **Custom** |
| `read-only` | `(read-only, never)` | **Custom** |
| `danger-full-access` | `(danger-full-access, never)` | `Full access`（命中预设） |
| `auto` | `permission/preset: auto` + `(danger-full-access, never)` | `Auto review`（`derive` 对 auto 有 `never` 特例） |

审批模式则与 Lead 无关：只要成员自己没切过、且本插件 `default` 仍是 `off`，就恒为「关闭」。

---

## 七、规避与修复选项

按代价从低到高：

1. **只想让成员不是「关闭」**：把本插件 `cordis.patch.yml` 的 `default` 从 `off` 改成 `request` / `auto-edit` / `smart`。但成员仍会显示 `Custom`——因为审批**策略**被委派钉成 `never`，与模式是两回事。
2. **想让成员不显示 `Custom`（不改代码）**：先让 Lead 切到 `danger-full-access` 或 `auto`，再 `spawn_teammate`。子会话继承的组合正好命中预设。
3. **在成员会话里就地切**：用审批芯片切到非 `off` 模式——本插件会经 `findAskPresetForSandbox` 找回 `(目标 sandbox, ask)` 的预设并整组写入，`Custom` 随之消失。前提是该会话可交互。
4. **宿主层根治（需上游改动）**：在预设表新增一组 `(workspace-write, never)`；或改委派边界不再把 approval 钉成 `never`（属于安全语义变更，不建议）。本插件单独改不动这一层。

---

## 八、证据索引

宿主（`deepseek-harness` @ `dsh-v0.2.0-rc.2`）：

- `packages/subagent/subagent/src/child-agent.ts:249` — `captureDelegatedPolicyOverrides`（`:254` 钉 `approvalPolicy: 'never'`）
- `packages/subagent/subagent/src/child-agent.ts:267` — `appendDelegatedPolicyOverrides`
- `packages/subagent/subagent-in-process-driver/src/index.ts:119` / `:123` — fresh 委派路径的捕获与落盘
- `packages/subagent/subagent/src/continuation.ts:131` — continuable 委派路径的捕获
- `packages/interaction/permission-presets/src/index.ts:79` — `CUSTOM_PRESET`
- `packages/interaction/permission-presets/src/index.ts:188` — 默认预设表
- `packages/interaction/permission-presets/src/index.ts:348` — `derive()`
- `packages/interaction/permission-presets/src/index.ts:384` — `optionOf('custom')` → `name: 'Custom'`
- `packages/interaction/permission-presets/src/index.ts:428` — `pinInitialPermission()`
- `packages/client/ui-permission-presets/src/client/PermissionSelect.tsx:96` — 芯片当前标签解析
- `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:443` — 权限芯片以 `locked` 渲染
- `packages/client/ui-subagent/src/client/index.ts:37` — 只读 composer 的接管条件
- `docs/subsystems/subagent.md:459` — 委派权限的官方说明

本插件（`dsh-user-approval-mode` 0.7.x 线，HEAD `d765fb6069`）：

- `src/index.ts:147` — `Config.default` 默认 `'off'`
- `src/index.ts:428` — `applyModeSandboxChange()`：`off` 直写 sandbox、不走预设 bundle
- `src/permission-presets-helper.ts` — `findAskPresetForSandbox()`
- `src/client/ApprovalModeChip.tsx:27` / `:38` — 模式列表与 `off` 回退
- `src/client/locales.ts:25` — `'mode.off': '关闭'`
- `README.md:75` — "Permission-presets interaction"（orphan `custom` 交互说明）
- `cordis.patch.yml` — 入口 `id: dsh-user-approval-mode`、`default: off`

---

## 九、未验证项

- 未在真实 Web 会话中逐一验证「点芯片后子会话日志确实新增事件」；`Custom`/`关闭` 的**来源**已由源码与官方文档确证，切换是否落盘取决于该成员会话当时是否有活 agent。
- 若后续本插件改为事件驱动（README 已列为 future improvement），芯片的会话同步行为会变化，本文第五节的「就地切换」结论需要复核。

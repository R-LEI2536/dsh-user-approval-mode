# dsh-user-approval v0.4.0 升 DSH v0.1.5-alpha.1 兼容性审计

**日期**: 2026-09-09
**审计基线**: 本地 `deepseek-harness` HEAD = `7169660d33`（`dsh-v0.1.2-rc.1`）
**审计目标**: `dsh-user-approval` v0.4.0 升到 `dsh-v0.1.5-alpha.1` 的可行性
**审计范围**: 仅本插件（`dsh-user-approval`）；其他 8 个第三方插件不在本次审计范围内
**审计结论**: ✅ **可直接升级，但需补两处 cast 收紧**（P1 风险）

---

## 一、本地基线状态

| 项目 | 值 |
| --- | --- |
| 本插件 HEAD | `11b8d02e3f Merge branch 'feature/smart-mode' into main` |
| 本插件版本 | `0.4.0`（`package.json:3`） |
| 本地 `deepseek-harness` tag | `dsh-v0.1.2-rc.1`（最新本地 tag） |
| 跨版本数 | 4 个（rc.1 → v0.1.3-alpha.1 → v0.1.3-alpha.2 → v0.1.5-alpha.1） |
| 工作区状态 | 无未提交修改 |

---

## 二、跨版本已知破坏性变更摘要

按对 `dsh-user-approval` 的实际影响力排序：

### 2.1 v0.1.3-alpha.1

- Session 格式升 V2（V0/V1 不可降级读取）
- `agentLoop.create()` 改 async；`SessionHandle` 取代裸 Session 生命周期
- **`Session.events` getter 重命名为 `Session.snapshotEvents()`**（v0.1.2-alpha.5 已变更）
- `SessionSeq` / `SessionLogOffset` 强类型品牌化区分

### 2.2 v0.1.3-alpha.2

- ⚠️ **普通 subprocess handle 移除 `pid` 字段**（终端 handle 不受影响）
- 自定义 persona 配置拆分为 prefix / suffix
- 默认工具调整（SDK/Headless/ACP 默认带 `read`/`write`/`edit`）

### 2.3 v0.1.5-alpha.1

- ⚠️ **移除 `ctx.agent`**：调用方必须显式传 Agent；可继续对话的子代理归属修正
- ⚠️ **Inbox API 变更**：`Inbox` 改为类型接口；`hasPending` / `claim` 不再公共；新约定是 `agent.inbox` 读写
- Session 格式升 V3（V2 不可降级读取；恢复历史会话生成新日志并保留原文件）

---

## 三、本插件 surface 逐项核查

### 3.1 报告声明 vs 实际源码对照表

| # | 报告 3.4 声明 | 实际源码命中 | 判定 |
|---|---|---|---|
| 1 | `ctx.on('tools/pre-execute', exec, next)` | `src/index.ts:314` | ✅ 正确 |
| 2 | `exec.agent.session`（来自 exec 链路） | `src/index.ts:317` 取一次 `exec.agent`，line 322/333/344/432 通过 `agent.session` 访问 | ✅ 正确；是 v0.1.5 移除 `ctx.agent` 的正确绕法 |
| 3 | `setSandboxMode(session, sandbox)` from `@deepseek-ai/dsh-sandbox-policy` | `src/index.ts:27,389,403` | ✅ 正确 |
| 4 | **`sandboxPolicy.overrideOf(session)`** —— 已采用新 API | `src/index.ts:333,413` 调用；**line 216-218 是 `as` cast** | ✅ 调用正确；⚠️ **报告漏说这是 cast** |
| 5 | `ctx.inject(['commands'], ...)` 注册 `/approval-mode` | `src/index.ts:418` | ✅ 正确 |
| 6 | `ctx.inject(['settings'], ...)` + `settings.installSection` | `src/index.ts:442-446` | ✅ 正确 |
| 7 | 自定义 `ctx.agentDefaultModel`、`ctx.permissionPresets` 服务 | `src/index.ts:67` 声明 `agentDefaultModel`；`src/index.ts:392` cast 访问 `permissionPresets` | ✅ 正确；⚠️ **`permissionPresets` 也是 cast** |
| 8 | 不读 `ctx.agent` | 全 grep 无命中 | ✅ 正确 |
| 9 | 不读 Inbox 公共方法 `hasPending` / `claim` | 全 grep 无命中 | ✅ 正确 |
| 10 | `SessionEvent` 从 `@deepseek-ai/dsh-session` 类型 import | `src/index.ts:26,smart-classifier.ts:22,permission-presets-helper.ts:11` 均为 `import type` | ✅ 仅类型 import，runtime 不依赖 |

### 3.2 报告漏掉的真实风险点

#### 🔴 P1：`sandboxPolicy.overrideOf` 是 `as` cast（`src/index.ts:216-218`）

```typescript
const sandboxPolicy = ctx.get('sandboxPolicy') as
  | { defaultMode?: SandboxMode; overrideOf: (session: Session) => SandboxMode | undefined }
  | undefined
```

**风险**：升 `v0.1.5-alpha.1` 时若 `sandboxPolicy` 改名 / `overrideOf` 签名变（多参、异步、用 `SessionHandle` 代替 `Session`），TypeScript 不会报错，runtime 会在 line 333 / 413 抛 `overrideOf is not a function`。

**修复方向**：
```typescript
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
const sandboxPolicy = ctx.get<SandboxPolicyService>('sandboxPolicy')
```

#### 🟡 P2：`permissionPresets` 也是 `as` cast（`src/index.ts:392`）

```typescript
const permissionPresets = ctx.get('permissionPresets') as PermissionPresetsServiceLike | undefined
```

**风险**：本地 `PermissionPresetsServiceLike` 接口（`src/permission-presets-helper.ts`）现在能编译纯粹因为 DSH 没暴露类型；升 v0.1.5 时若 DSH 暴露正式类型且方法签名不一致，两边都不报错，行为可能静默不对。

**修复方向**：先把 DSH 暴露的正式类型 import 进来对照 `PermissionPresetsServiceLike`，如有差异用 DSH 类型替换。

#### 🟢 P3（无影响）：`sessionEventsFor` 双版本 fallback（`src/smart-classifier.ts:530-536`）

```typescript
function sessionEventsFor(session: Session): readonly SessionEvent[] | undefined {
  if (typeof (session as { snapshotEvents?: () => readonly SessionEvent[] }).snapshotEvents === 'function') {
    return (session as { snapshotEvents: () => readonly SessionEvent[] }).snapshotEvents()
  }
  const events = (session as { events?: readonly SessionEvent[] }).events
  return events
}
```

v0.1.5-alpha.1 时 `snapshotEvents()` 仍存在 → 走新分支 ✅。若 v0.1.5 同时把 `events` getter 物理删除，老 host 探测分支会拿到 `undefined` —— 不是 bug，只是降级路径失效。

#### ✅ 已确认无影响的其它 surface

- `commands.register({ name: 'approval-mode', ... })`（`src/index.ts:418-435`）—— 仅用 `agent.session`、`effectiveMode`、`applyMode`，不触 V2/V3 Session 形状
- `settings.installSection(ctx, NS, Config, entryConfig, { setSource, onChange })`（`src/index.ts:442-446`）—— 用的是 v0.1.2-alpha.3 之后稳定的 SettingsProvider 接口
- `ctx.locale.register(...)` / `ctx.slots.inject('conversation.input.left' | 'settings.section', ...)`（`src/client/index.ts:78,87,144`）—— locale / slots API 在 4 个版本内稳定

### 3.3 本插件不涉及的表面（无影响）

- `handle.pid`（v0.1.3-alpha.2）—— 本插件不管理 subprocess，全 grep 无命中
- `agentLoop.create()`（v0.1.3-alpha.1）—— 本插件不创建 agent loop
- persona prefix / suffix（v0.1.3-alpha.2）—— 本插件不挂载 persona service
- `new Inbox(...)` / `Inbox.hasPending` / `Inbox.claim`（v0.1.5-alpha.1）—— 全 grep 无命中

---

## 四、升级可行性结论

### 4.1 整体判定

| 风险等级 | 内容 | 升级前必须处理？ |
|---|---|---|
| 🔴 P1 | 两处 `as` cast（`sandboxPolicy` / `permissionPresets`） | **是** —— 收紧为正式类型 |
| 🟡 P2 | `effectiveMode` / `applyMode` / `currentSandboxFor` 都依赖 `agent.session` 形状不变 | 否 —— 形状不变则无影响 |
| 🟢 P3 | `sessionEventsFor` 探测分支 | 否 —— 降级路径失效不影响主路径 |

### 4.2 升级 checklist

1. **备份 `~/.dsh/sessions/`**：V2 → V3 不可降级，先备份
2. **收紧两处 cast**：
   - `src/index.ts:216-218` `sandboxPolicy.overrideOf` → `import type { SandboxPolicyService }` + `ctx.get<SandboxPolicyService>(...)`
   - `src/index.ts:392` `permissionPresets` → 用 DSH 正式类型替换本地 `PermissionPresetsServiceLike`
3. **更新 `package.json:34-49` peer deps**：`>=0.1.2-rc.1` → `>=0.1.5-alpha.1`
4. **跑 `pnpm test` + `pnpm typecheck` + `pnpm build`**：重点关注 `sessionEventsFor`（smart classifier）和 `overrideOf`（sandbox escalation）两个 runtime 调用点
5. **live 验证 smart mode**：参考 `2026-08-20-plugin-event-compatibility-issue.md` 的教训 —— 脚本不算，必须 DSH 服务端跑真 `tools/pre-execute` waterfall，6 个场景（echo hello / 重复 echo / rm -rf / curl|sh / git push --force / 静默 allow）都要覆盖

### 4.3 不需要做的事

- ❌ 不需要做 `dsh-reme-auto-router` 那种"`handle.pid`"硬改
- ❌ 不需要做 `dsh-reme-support` 那种"`session.events`"软 bug 修复（已用双版本 fallback）
- ❌ 不需要迁移 `ctx.agent` 写法（已经通过 `exec.agent` 拿）
- ❌ 不需要适配 Inbox API（本插件不读 Inbox）

---

## 五、报告原文已读部分

用户提供的审计报告（覆盖 7 个第三方插件）里对 `dsh-user-approval` 的判定是 **3.4 节"✅ 无影响（已用新 API）"**。

本笔记对 3.4 节做了逐项源码核对，发现：
- 报告的核心结论 ✅ 成立
- 报告漏说了 **`sandboxPolicy.overrideOf` 是 `as` cast 调用**这一关键细节
- 报告漏说了 **`permissionPresets` 也是 `as` cast 调用**

这两处 cast 是 `dsh-user-approval` 升 `v0.1.5-alpha.1` 时唯一需要补的小改动。

---

## 六、一句话总结

**`dsh-user-approval` v0.4.0 升 DSH `v0.1.5-alpha.1` 可行；只需收紧 `src/index.ts` 的两处 `as` cast（`sandboxPolicy` / `permissionPresets`），并把 `package.json` 的 peer dep 下限从 `>=0.1.2-rc.1` 提到 `>=0.1.5-alpha.1`，smart mode 需要 live 验证。**

# DSH 升级兼容性审计 —— 工作流复盘

**日期**: 2026-09-09
**场景**: 用户给出一份覆盖 7 个第三方插件的 DSH 升级审计报告，要求"看一下"。本插件（`dsh-user-approval`）是其中之一。
**目的**: 把这次会话的工作模式沉淀下来，下次面对同类"审计报告 / 决策评审"任务时可直接复用

---

## 一、核心方法论（5 步）

| # | 步骤 | 目的 | 这次具体做了什么 |
|---|---|---|---|
| 1 | **认领范围（scope lock）** | 用户没说"只审计本插件"时，**先看一眼工作区** | `list_directory /home/hive/projects/dsh-plugin_dev` 发现 9 个第三方插件目录，报告只覆盖 7 个 |
| 2 | **校准基线事实** | 报告封面 / 表格里的"事实声明"必须用源码对照，**不要默认相信** | `git log` / `git rev-parse` / `git tag` 核对本地 HEAD 和 tag；`read package.json` 核对版本号 |
| 3 | **用 grill-with-docs skill 反问** | 报告**必漏必错**，逐项挑刺而不是接受结论 | 加载 `grill-with-docs` skill，**一次一个问题**，等用户回完再问下一个 |
| 4 | **缩小范围后再深挖** | 用户说"做好我们自己的事"后，**不要回头再纠结被遗漏的插件** | grep 高风险 API surface（`session.events` / `overrideOf` / `handle.pid` / `ctx.agent` / `hasPending` 等） |
| 5 | **逐项对照表 + 漏点清单** | 报告里的每一行声明要么 ✅ 成立，要么 ⚠️ 漏，要么 ❌ 错 | 列 10 行"报告声明 vs 实际源码对照表"，单列"漏掉的真实风险点"小节 |

---

## 二、关键决策与教训

### 2.1 Q1 的处理 ——"工作区有 9 个插件，报告只覆盖 7 个，要不要追？"

**第一次答案**（被用户驳回）："应当补做遗漏插件的审计 / 明确说未覆盖"

**用户回应**："你不应该关心其他插件。做好我们自己的事"

**沉淀**：当用户给出一份审计报告时，**先问"这份报告是给你做事的依据还是给你评审计的对象"**。如果用户只是想让"自己负责的那个"过审计，那工作区其他插件属于 **out-of-scope** —— 用 `list_directory` 看到即可，但不要展开去审计。**反之如果用户问"这份报告完整吗"，才去挑 scope 漏洞**。

### 2.2 Q2 的处理 ——"报告对 `dsh-user-approval` 的 ✅ 无影响下得是否过快？"

**这次答案**（被用户接受）："先 grep 实际 surface 再说"

**沉淀**：用户拒绝"空对空地讨论报告"，他们要的是**对源码的硬证据**。一旦用 grep 命中了具体行号（如 `process-manager.ts:154,291` 对得上报告），讨论就有锚点。下次做法：

- **永远先 grep 再讨论**
- grep 关键词按"高风险 surface" 列表走（见下表）
- grep 结果命中后**才允许进入"挑刺"环节**

### 2.3 高风险 surface grep 清单（DSH 升级审计专用）

```bash
# 必须查的 10 个 grep（用 ripgrep / grep 工具，不要用 bash ls）
session\.events|session\.snapshotEvents|\.snapshotEvents\(|SessionSeq|SessionLogOffset|eventAt\(
effectiveSandboxMode|sandboxPolicy\.overrideOf|setSandboxMode
ctx\.agent\b|hasPending|new Inbox\(|\.claim\(
handle\.pid|SubprocessHandle
persona|prefix|suffix|agentLoop\.create
# —— 这次新增的两条（cast 模式 silent failure）——
as \{
ctx\.get\('
```

**用法**：每个正则独立 grep 一次，把命中行号按文件聚合；对命中行 **read 上下文 30 行**，判断是否在运行时路径上（注释、docs 里的弃用方案都不是运行时路径）。

### 2.4 cast 模式是"沉默失败"的重灾区

这次发现两处 cast 是报告**完全漏掉的风险点**：

```typescript
// src/index.ts:216-218
const sandboxPolicy = ctx.get('sandboxPolicy') as
  | { defaultMode?: SandboxMode; overrideOf: (session: Session) => SandboxMode | undefined }
  | undefined

// src/index.ts:392
const permissionPresets = ctx.get('permissionPresets') as PermissionPresetsServiceLike | undefined
```

**沉淀**：审计 DSH 插件兼容性时，**`ctx.get(...) as <local shape>` 是一种 silent failure 模式**——升级后 DSH 改接口，TypeScript 不报错，runtime 才抛 "X is not a function"。升级 audit 的 grep 清单里**应当加上 `as \{|ctx\.get\('` 两个正则**。

### 2.5 docs/ 下的"决策记录 vs 实际代码"区分

`docs/2026-08-20-plugin-event-compatibility-issue.md` 里有 `session.events` 的代码片段（line 265-266），grep 会命中。但它是**弃用方案的讨论稿**，不是运行时路径。

**沉淀**：grep 命中 docs/ 时，**必须 read 文档结尾的"最终方案"段落**，确认命中行是否还在用。docs/ 里的代码片段有三种状态：
- (a) 当前正在用 → 必须改
- (b) 弃用方案讨论稿 → 看清楚但不改
- (c) ADR 里的设计草图 → 看清楚但不改

---

## 三、工作流模板（下次直接套用）

**触发条件**：用户给出一份审计报告 / 升级方案 / 决策评审，让我"看一下 / 评估一下 / 复盘一下"。

**步骤**：

1. **30 秒 scope check**
   - `list_directory <workspace>` 看真实目录
   - 对照报告声称的"覆盖范围"——是否一致
   - ⚠️ **不主动追问 scope**；如果用户没明确说"审计全部"，就**默认只关注用户提到的那 1-2 个对象**
   
2. **认领本插件的版本基线**
   - `git log --oneline -5` + `git rev-parse HEAD` + `git tag -l | tail`
   - `read package.json` 看 `name` / `version` / `peerDependencies`
   - 把基线写到笔记的"一、本地基线状态"小节

3. **加载 grill-with-docs skill**（如果是评审报告 / 计划类任务）
   - 按 skill 要求 **一次一个问题**
   - 但**每个问题先用 grep 找证据再问**，不空问

4. **跑高风险 surface grep（10 条正则）**
   - 每个 grep 命中后 read 上下文 30 行
   - 把命中点按"✅ 在用 / ⚠️ 弃用稿 / ❌ 真 bug"分类

5. **列对照表（10 行）**
   - 左列：报告声明
   - 中列：实际源码命中（含行号）
   - 右列：✅ 正确 / ⚠️ 报告漏说 X / ❌ 报告错误
   - **对照表 + 单独"漏掉的真实风险点"小节**比"评注式批改"更易复用

6. **给出最终结论**
   - 三色风险表：🔴 必须修 / 🟡 顺手修 / 🟢 无影响
   - "升级 checklist" 用编号清单，每条可执行
   - "不需要做的事" 用 ❌ 列表，避免误改

7. **写日期化笔记到 `docs/`**
   - 命名格式：`YYYY-MM-DD-<topic>.md`
   - 跟既有 `docs/2026-08-20-plugin-event-compatibility-issue.md` 同格式：基线 → 摘要 → 核查 → 结论 → 一句话总结
   - **不写 ADR**——除非决定已落、不可逆、有真实 trade-off。这次是"评估"，不是"决定"

---

## 四、这次会话产出物清单

| 路径 | 性质 | 何时用 |
|---|---|---|
| `docs/2026-09-09-dsh-v0-1-5-alpha-1-compatibility-audit.md` | 审计结论（针对 `dsh-user-approval` 一个插件） | 真要升 `v0.1.5-alpha.1` 时按它做 |
| `llm-workflows/2026-09-09-dsh-upgrade-audit-workflow.md` | 本工作流复盘（这份） | 下次遇到同类审计 / 评审任务直接套用 |

---

## 五、一句话总结

**审计报告的本质是"别人的结论"，不要直接接受；用 10 条 grep 正则去对照，再把"漏点"独立成节；scope 由用户决定（用户没说要全部就只盯一处）；最后把审计结论和工作流方法论分别写到 `docs/` 和 `llm-workflows/` 下，前者用日期 + 主题命名，后者用日期 + 工作流名命名。**

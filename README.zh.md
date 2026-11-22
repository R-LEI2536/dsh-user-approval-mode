# dsh-user-approval-mode

**版本 0.11.0**

[English](./README.md)

用户审批模式插件，为 DeepSeek Harness 提供五种审批模式，控制工具执行前是否需要用户确认。

## 更新日志

发布说明见 [CHANGELOG.md](./CHANGELOG.md)。

## 演示

![审批模式选择器演示](./assets/example.webp)

动画展示了如何在 DSH Web 中使用 Web UI 选择器快速切换审批模式。

## 功能特性

- **五种审批模式**：`request`、`auto-edit`、`smart`（新增）、`yolo`、`off`
- **Web UI模式选择器**：输入框下方的快捷芯片，无需命令即可切换审批模式
- **设置页面**：在 `设置 → 审批模式` 里配置审批选项（工具族名单、各模式 sandbox 策略、审批弹窗文案模板，以及 smart 分类器的 provider/model）。默认模式、未分类策略与 smart 内部细节仅由部署方配置（在 `cordis.yml` 中设置）。
- **Smart 模式 shell 分类器**：五步流水线（危险清单 → 只读 git 快路径 → 会话记忆 → LLM 分类器 → fail-safe），自动放行例行 shell 命令，危险或不确定仍转人工。
- **只读 git 快路径**：严格解析后的只读命令链（`git status`、`git log`、`git diff` 等，用 `&&` `;` `|` 或换行串起来）外加 `echo "…"` 装饰行，在 request / auto-edit / smart 下免审，代理最高频的 shell 调用不再弹窗。设置页有开关（`readOnlyGitCommands`），也可在 `cordis.yml` 里钉 base。
- **自带 skill**：包内随附 `dsh-approval-shell-style`，代理可以加载它来写「审批友好」的命令（快路径语法、预期的弹窗、被拒后的处理）。插件装着的会话都能在技能目录里看到，卸载插件即消失。
- **工具族分类**：自动将工具分为编辑、Shell、只读和其他四类
- **PTC preset 兼容**：agent preset 选 `ptc` 时模型只能直调 `run_code`；插件先按程序代码结构裁决顶层调用（纯 `tools.*` 程序、受识别的纯运算/控制流/白名单方法放行交给子调用闸门，其余 JS 在 request/auto-edit 下弹窗、smart 先快放被识别的程序、其余送分类器），程序内每个 `tools.*` 子调用仍按真实工具名逐个过闸，弹窗里附上代码/命令/路径摘要
- **沙箱集成**：切换模式时自动调整沙箱策略
- **会话级别**：每个会话维护独立的审批模式
- **内存状态**：会话级审批模式存储在内存中，重启后恢复默认
- **斜杠命令**：通过 `/approval-mode` 命令切换模式

## 审批模式

审批模式灵感来源于 [Qwen Code](https://github.com/QwenLM/Qwen-Code)。

| 模式 | 编辑工具 | Shell 工具 | 其他工具 | 只读工具 | 使用场景 |
|------|---------|-----------|---------|---------|----------|
| `request` | 需审批 | 需审批 ¹ | 需审批 | 允许 | 最高安全性，所有修改都需要审批 |
| `auto-edit` | 允许 | 需审批 ¹ | 需审批 | 允许 | 平衡模式，自动编辑文件但监控 Shell |
| `smart` | 允许 | 分类器（5 步流水线）¹ | 需审批 | 允许 | 例行 shell 自动放行，危险或不确定仍转人工 |
| `yolo` | 允许 | 允许 | 允许 | 允许 | 无需审批，完全自动化 |
| `off` | 允许 | 允许 | 允许 | 允许 | 禁用，恢复 DSH 默认行为 |

¹ 例外：严格解析后的只读命令（`git status` / `git log` / `git diff` 这类单条、`echo "…"` 装饰行，或用 `&&` `;` `|` 串起来的组合）在这三个模式下免审直放——见[只读 git 命令](#只读-git-命令)。

**PTC agent preset 下这张表同样成立。** `ptc` preset 只让模型直接调用 `run_code`，其它原生工具只能作为程序内的 `tools.*` 绑定调用。`run_code` 本体先按程序代码结构裁决：整段只有 `tools.*` 调用的程序放行交给子调用闸门，受识别的纯运算、控制流与白名单方法按 `runCodePureExpressions` 开关放行，出现其它 JS 在 request/auto-edit 下弹窗（smart 先快放被识别的程序、其余送分类器，yolo/off 不查）；程序内每个子调用再按上表裁决——request 下的 `write` 子调用要审批，smart 下的 `bash` 子调用走五步流水线，等等。细节与限制见下文「已知限制 → PTC preset」。

### 模式详情

#### `request` - 最高安全性
- **行为**：所有编辑、Shell 和未分类工具都需要审批，只读命令链除外（快路径）
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：高安全环境、生产系统或处理关键文件时

#### `auto-edit` - 平衡模式
- **行为**：编辑工具自动批准，Shell 和未分类工具需要审批，只读命令链除外（快路径）
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：开发环境，信任文件修改但需要监控 Shell 命令

#### `smart` - Shell 分类器（新增）
- **行为**：编辑工具自动批准；shell 工具走 5 步流水线（危险清单 → 只读 git 快路径 → 会话记忆 → LLM 分类器 → fail-safe）；未分类工具仍需审批；只读免审。批准过的调用在 `smartSessionMemoryTtlMs`（默认 30 分钟）内被会话记忆复用。
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：长流程设置循环，shell 命令多是例行的，审批会中断节奏。危险或不确定的 shell 仍弹给用户；危险清单是先于 LLM 的硬底。
- **风险**：LLM 可能误判。危险清单无法枚举所有破坏性模式。插件重载通过 `AbortController` 终止在飞的分类调用。详见 Known Limitations 中的 "Smart Mode Risks"。

#### `yolo` - 完全自动化
- **行为**：所有工具都无需审批
- **沙箱**：自动切换到 `workspace-write`
- **使用场景**：可信环境、快速原型开发或需要完全自动化时

#### `off` - 禁用
- **行为**：插件禁用，恢复 DSH 默认审批行为
- **沙箱**：恢复到组合默认
- **使用场景**：临时禁用插件而不卸载

**注意**：切换审批模式时，会自动联动调整沙箱模式到配置的默认值。这会覆盖您之前手动调整的沙箱设置。如果您希望在新的审批模式下使用不同的沙箱模式，可以在切换审批模式后再次手动调整沙箱。

**与权限预设的联动**（宿主装了 `dsh-permission-presets` 时）：切换到非 off 模式会把沙箱+审批策略组合恢复到匹配的命名预设，避免落到孤立的 `custom` 状态。原理是找到 `(sandbox, ask)` 组合匹配该模式 `sandboxDefaults` 值的预设并应用；若没有匹配预设（例如您把 `sandboxDefaults.smart` 改成 `read-only`），插件回退到直接写 `sandbox/mode`，孤立状态由部署方负责。off 模式保持直接写 `sandbox/mode`（不联动预设——off 即「不关心预设」）。

## 安装

### 从 GitHub 安装

```bash
dsh plugin --profile web add github:R-LEI2536/dsh-user-approval-mode
```

构建产物 `lib/` 已随仓库提交，所以安装时**不需要在你的机器上执行任何构建**：DSH 直接从这个 checkout 读取 `lib/index.js` 和 `lib/client.js`。

### 从本地目录安装（开发模式）

```bash
pnpm install && pnpm build
dsh plugin --profile web add /path/to/dsh-user-approval
```

本地安装会让 DSH 直接指向这个目录，没有任何环节会替你构建，所以 `lib/` 必须存在：克隆之后、以及每次改动 `src/` 之后都要跑一次 `pnpm build` —— 否则 Web UI 一直提供的是上一次的产物。

## 使用方法

### 使用Web UI模式选择器

插件在DSH Web输入框下方提供可视化的模式选择器（显示为一个小按钮/标签）：

**位置**：在聊天输入框下方的工具栏中，你会看到一个显示当前模式的按钮（例如"审批：关闭"）

### 通过命令切换审批模式

在 DSH Web GUI 中使用 `/approval-mode` 命令：

```
/approval-mode              # 显示当前模式
/approval-mode request      # 切换到 request 模式
/approval-mode auto-edit    # 切换到 auto-edit 模式
/approval-mode smart        # 切换到 smart 模式（LLM shell 分类器）
/approval-mode yolo         # 切换到 yolo 模式
/approval-mode off          # 禁用（恢复默认）
```

### 示例工作流

```
# 以最高安全性开始
/approval-mode request

# Agent 读取文件（自动批准）
# Agent 尝试编辑文件 → 弹出审批对话框

# 切换到 auto-edit 以加快开发
/approval-mode auto-edit

# Agent 自动编辑文件
# Agent 运行 bash 命令 → 弹出审批对话框

# 切换到 yolo 完全自动化
/approval-mode yolo

# 所有工具无需审批即可执行
```

## 已知限制

### 会话重启行为

本插件使用**内存存储方案**来避免 DSH 会话事件类型的兼容性问题。因此：

- ✅ **会话加载成功**：DSH 重启后会话可以正常加载（无兼容性问题）
- ⚠️ **审批模式恢复默认**：DSH 重启后（后端 WeakMap 清空），审批模式恢复为默认值
- ✅ **UI 从服务器同步**：浏览器刷新时，UI 会从服务器获取当前模式
- ✅ **当前会话有效**：审批模式在当前会话期间保持

**为什么这样设计？**
- DSH 目前不支持插件自定义事件类型
- 写入自定义事件会导致重启后出现 `SessionFormatUnsupportedError`
- 内存存储确保会话在各个 DSH 版本间保持兼容

**解决方法**：
- 重启后使用 `/approval-mode` 命令快速切换模式
- 或使用 Web UI 选择器切换模式

### DSH 版本兼容

**v0.3.0+ 要求 DSH ≥ 0.1.2-alpha.3**：

插件 v0.3.0 已迁移到 DSH 0.1.2-alpha.3 的 API，不再兼容更早的 DSH：

- `@deepseek-ai/dsh-sandbox-policy` 移除了 `effectiveSandboxMode`、`@deepseek-ai/dsh-settings` 移除了 `installSettingsSection` / `settingsNamespace`、客户端包 `@deepseek-ai/dsh-client-runtime` 被重命名为 `dsh-client-modules`
- 16 个 `@deepseek-ai/dsh-*` peer dep 从 `>=0.1.0-rc.8` 升到 `>=0.1.2-rc.1`（下限在 v0.3.2 抬到 rc.1，见下）

如果你的 harness 还停在老 DSH 版本，请继续使用插件 v0.2.0，等 harness 升到 `0.1.2-alpha.3` 之后再升插件。

**v0.3.2+ 把下限抬到 DSH ≥ 0.1.2-rc.1**：

从 v0.3.2 起，peer dep 下限从 `>=0.1.2-alpha.3` 挪到 `>=0.1.2-rc.1`（这也是 harness 自身当前发布的版本）。源代码不需要任何改动：v0.3.0 迁移里引入的每个调用点——`ctx.sandboxPolicy.overrideOf(session)`、`setSandboxMode(session, mode)`、`ctx.settings.installSection(...)`、`Context` / `SettingsScope` / `SessionId` 的导入路径、以及 `dsh-client-modules` 边界——在上游 `alpha.4`、`alpha.5`、`rc.1` 这几个版本里形状都没变。该区间唯一的破坏性重构 `refactor(session)!: distinguish event seqs from log offsets` 只是把 `SessionSeq` 和 `SessionLogOffset` 拆成了不同的品牌类型；插件只用 `session.events` 这个事件数组，从不直接读写序号字段，新的品牌类型不影响任何调用点。

如果你的 harness 还停在 `0.1.2-alpha.3` 到 `0.1.2-alpha.5` 之间，请继续使用插件 v0.3.1。

### UI 状态同步

Web UI 状态独立管理，刷新时从服务器同步：

- ✅ **UI 立即更新**：使用 Web UI 选择器时立即更新显示
- ✅ **UI 从服务器同步**：浏览器刷新时从服务器获取当前模式
- ⚠️ **UI 不同步命令**：使用 `/approval-mode` 命令时 UI 不会自动更新
- ⚠️ **UI 显示旧值**：通过命令切换模式后，UI 显示旧值（需刷新）

**解决方法**：
- 刷新网页以同步 UI 和实际模式
- 或直接使用 Web UI 选择器，而不是命令

**为什么有这个限制？**
- UI 通过 React `useState` 独立管理状态（内存方案）
- 命令在服务端执行，但不产生事件（避免兼容性问题）
- 没有事件，就没有机制通知 UI 状态变化
- 这是一个**根本性的权衡**：要么使用事件（但会话无法加载），要么使用内存（但 UI 不同步）
- 我们选择了内存方案，确保会话可以正常加载

**未来改进**：
- 等待 DSH 上游提供插件自定义事件类型的官方支持
- 或提供机制让插件发出可忽略的事件（ignorable events）
- 一旦支持，本插件可以迁移到事件驱动方案，实现完整的 UI 同步

### DSH 版本兼容性

**v0.15.0+ 要求 DSH ≥ 0.2.1-rc.2（按 0.2.2-rc.3 验证）**：

依赖线与 0.14.0 完全相同——peer 下限、dev 钉与实算的兼容门都没动，下方
0.13.0 条目仍描述安装面，只多一条：`acorn` 现在是运行时依赖（`run_code`
代码结构门禁的解析器），随包安装。0.15.0 有三处变化：

- **审批问询文案重构并自带双语。** 默认模板为
  `[{family}] Tool: {tool} | Mode: {mode}`，经宿主 `displayReason` 通道
  显示（peer 下限 0.2.1-rc.2 起的宿主都支持），zh UI 显示内置中文版，
  会话日志保留英文。
- **顶层 `run_code` 程序按其代码结构分类。** 纯 `tools.*` 与已识别的纯
  计算/控制流程序放行到子调用门禁；其余程序在 request/auto-edit 下弹窗并
  附带 `[code: …]` 摘要；smart 模式下已识别的判定在危险名单之后快速放行。
- **smart 模式的分类器模型改从宿主模型目录选择。** provider/model/effort
  三行改为宿主 `session.modelCatalog()` 驱动的下拉框，新增的
  `smartReasoningEffort` 字段随分类调用下发。

两点说明：`0.2.2-rc.3` 的验证继承自 0.13.0（依赖线完全一致），且 0.15.0 本身
没有跑 typecheck、测试或构建。改动本身记录在 CHANGELOG，代码结构边界钉在
`test/run-code-gate.test.ts`。

**v0.14.0+ 要求 DSH ≥ 0.2.1-rc.2（按 0.2.2-rc.3 验证）**：

依赖线与 0.13.0 完全相同——peer 下限、dev 钉与实算的兼容门都没动,下方
0.13.0 条目（含 `0.2.2` 预发布宿主上预期内的 unmet peer 警告）仍然描述
本版本的安装面。0.14.0 变的是默认工具族名单：出厂四份名单按真实的
`0.2.2-rc.3` 宿主工具面重新审计过（见 CHANGELOG）。按静态验证交付
（`pnpm typecheck`、139 个测试、`pnpm build`），面对真实的 `0.2.2-rc.3`
类型。

**v0.13.0+ 要求 DSH ≥ 0.2.1-rc.2（按 0.2.2-rc.3 验证）**：

15 条 `@deepseek-ai/dsh-*` devDependencies 精确钉到 `0.2.2-rc.3`；`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 的 dev 钉保持在宿主的 `4.1.0` / `3.19.0`。15 条 **peer 范围保持 `^0.2.1-rc.2`**（`cordis` / `schemastery` 的 peer 保持 `>=4.0.5` / `>=3.18.5`），因此**安装下限没有变化**：从 `0.2.1-rc.2` 起的每个 `0.2.x` 宿主都接受本版本——包含整条 `0.2.2` 预发布线——`0.2.1-rc.1` 与任何 `0.2.0-rc.*` 宿主仍被拒收。三点需要知道：

- **`src/` 无改动，产物也没有变化。** 在 rc.3 类型下重建 `lib/` 逐字节复现已提交产物，因此同一份产物可在 `0.2.1-rc.5`、`0.2.2-rc.1` 与 `0.2.2-rc.3` 宿主上运行。
- **门禁是实算的，不是推出来的。** 现役 peer 在运行时 `0.2.2-rc.3`（以及 `0.2.2-rc.1` 与 `0.2.1-rc.5`）上均通过；只把 `@deepseek-ai/dsh-tools` 一条 peer 钉成 `0.2.2-rc.1` 的对照清单在 `0.2.2-rc.3` 上被拒，证明门不是恒真。门禁实现与 rc.1 树逐字节一致。
- **在 `0.2.2-rc.3` 宿主上安装可能出现 unmet peer 警告。** npm/pnpm 用默认预发布规则，`^0.2.1-rc.2` 不认 `0.2.2` 预发布；判据是宿主兼容门（`includePrerelease: true`，可通过）。这些警告是预期内的，不代表被拒收。

0.13.0 按静态验证交付（`pnpm typecheck`、137 个测试、`pnpm build`，以及用宿主自带 `evaluatePluginCompatibility` 实算的安装门），面对真实的 `0.2.2-rc.3` 类型。**实机验证（安装门、冷启动、Web UI）推迟到宿主升级那一轮**——本机宿主仍为 `0.2.2-rc.1`；清单见 [`docs/2026-11-14-dsh-v0-2-2-rc-3-compatibility-audit.md`](docs/2026-11-14-dsh-v0-2-2-rc-3-compatibility-audit.md)。

**v0.11.0+ 要求 DSH ≥ 0.2.1-rc.2（按 0.2.2-rc.1 验证）**：

15 条 `@deepseek-ai/dsh-*` devDependencies 精确钉到 `0.2.2-rc.1`；`@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 的 dev 钉到宿主的 `4.1.0` / `3.19.0`。15 条 **peer 范围保持 `^0.2.1-rc.2`**（`cordis` / `schemastery` 的 peer 保持 `>=4.0.5` / `>=3.18.5`），因此**安装下限没有变化**：从 `0.2.1-rc.2` 起的每个 `0.2.x` 宿主都接受本版本——包含 `0.2.2-rc.1` 与更晚的 `0.2.2`/`0.2.x` 预发布——`0.2.1-rc.1` 与任何 `0.2.0-rc.*` 宿主仍被拒收。四点需要知道：

- **模式菜单改为 portal。** 输入框 chip 的菜单渲染进 `document.body`，这是 DSH `0.2.2` 对 composer slot 的契约要求——停靠的输入框会裁切固定浮层。忽略该属性的旧宿主行为不变。
- **`apply_patch` 刻意不做分类。** DSH `0.2.2-rc.1` 默认关闭该工具（base bundle 与 Web `standard` preset 均为 `applyPatch: false`，已用 registry 上的 rc.1 已发布 tarball 复核）。若部署方开启它，请把 `apply_patch` 加进 `editTools`（设置 → 审批模式），否则它会落到 `unclassified: ask`。
- **门禁是实算的，不是推出来的。** 现役 peer 在 `0.2.2-rc.1` 与 `0.2.1-rc.5` 上均通过；只把 `@deepseek-ai/dsh-tools` 一条 peer 钉成 `0.2.1-rc.5` 的对照清单在 `0.2.2-rc.1` 上被拒。
- **在 `0.2.2-rc.1` 宿主上安装可能出现 unmet peer 警告。** npm/pnpm 用默认预发布规则，`^0.2.1-rc.2` 不认 `0.2.2` 预发布；判据是宿主兼容门（`includePrerelease: true`，可通过）。这些警告是预期内的，不代表被拒收。

0.11.0 按静态验证交付（`pnpm typecheck`、121 个测试、`pnpm build`，以及用宿主自带 `evaluatePluginCompatibility` 实算的安装门），面对真实的 `0.2.2-rc.1` 类型。**实机验证（安装门、冷启动、Web UI 的 portal 表现）推迟到宿主升级那一轮**——本机宿主仍为 `0.2.1-rc.5`；清单见 [`docs/2026-11-05-dsh-v0-2-2-rc-1-compatibility-audit.md`](docs/2026-11-05-dsh-v0-2-2-rc-1-compatibility-audit.md)。

**v0.10.0+ 要求 DSH ≥ 0.2.1-rc.2（按 0.2.1-rc.5 验证）**：

15 条 `@deepseek-ai/dsh-*` devDependencies 升到 `^0.2.1-rc.5`；15 条 **peer 范围保持 `^0.2.1-rc.2`**——它本来就接纳 `0.2.1-rc.3` / `0.2.1-rc.4` / `0.2.1-rc.5`（同属 `0.2.1` prerelease 段），从而让同一份已发布产物在 `0.2.1-rc.2`+ 宿主上都能装。**无需改源码**：rc.2 → rc.5 走廊里本插件消费的宿主包全部只改了版本号，客户端侧的改动（`ui-conversation`、`ui-primitives`）不触及本插件占用的两个 slot。两点需要知道：

- **安装下限没动，验证线抬了。** `0.2.1-rc.2` 到 `0.2.1-rc.5` 的宿主都会接受本版本；`0.2.1-rc.1` 与任何 `0.2.0-rc.*` 宿主仍被拒收。
- **`lib/` 不重建。** `src/` 无改动，已提交产物保持原样；在 rc.5 下重建的差异只有路径相关的 CSS 类名 hash 与 `//#region` 注释，CSS 文本与 JS 逐字节一致。

0.10.0 按静态验证交付（`pnpm typecheck`、115 个测试、`pnpm build`，均面对真实的 `0.2.1-rc.5` 类型），安装门谓词实算在 `0.2.1-rc.2` … `0.2.1-rc.5` 全部通过；**实机验证（安装门、冷启动、Web UI）推迟到宿主升级那一轮**，清单见 [`docs/2026-11-01-dsh-v0-2-1-rc-5-compatibility-audit.md`](docs/2026-11-01-dsh-v0-2-1-rc-5-compatibility-audit.md)。

**v0.9.0+ 要求 DSH ≥ 0.2.1-rc.2**：

所有 `@deepseek-ai/dsh-*` peer 范围升到 `^0.2.1-rc.2`（devDependencies 同步）；`@deepseek-ai/cordis` 升到 `>=4.0.5`，`@deepseek-ai/schemastery` 升到 `>=3.18.5`。**无需改源码**：DSH `0.2.0-rc.2` 到 `0.2.1-rc.2` 之间，本插件消费的每个包要么零改动，要么只是加法式变更。升级前有三点需要知道：

- **下限是 `0.2.1-rc.2`，不是 `0.2.1-rc.1`。** `^0.2.1-rc.2` 不含 `0.2.1-rc.1`，也不含任何 `0.2.0-rc.*` 宿主。这是刻意的：把范围钉在插件实际验证过的那条线上，就不再依赖解析器的行为。（`^0.2.1-rc.1` 实测解成了 `0.2.1-rc.1` 而不是 rc.2 —— 因为 pnpm 11 会对一天内新发布的版本做隔离；`pnpm-workspace.yaml` 现已豁免整个 DSH scope 并把窗口显式写出。）
- **必须与宿主同批次发布。** 低于 `0.2.1-rc.2` 的宿主会拒收本插件的 peer。本包是 bundle 形态（`dsh.bundle.patch`），拒收会跳过**整个 bundle**（`dsh: skipping profile bundle "dsh-user-approval-mode"`）—— 模式 chip 和"审批模式"设置页一起消失，而不是只禁用某一行。
- **`@deepseek-ai/dsh-invariants` 与 `./invariant` 已被移除。** 官方的运行时不变量机制在本走廊整体删除。本插件从未使用；唯一痕迹是本地那份教程章节，现已删除。

0.9.0 按静态验证交付（`pnpm typecheck`、115 个测试、`pnpm build`，均面对真实的 `0.2.1-rc.2` 类型）；**实机验证（安装门、冷启动、Web UI）推迟到宿主升级那一轮**，清单见 [`docs/2026-10-18-dsh-v0-2-1-rc-2-compatibility-audit.md`](docs/2026-10-18-dsh-v0-2-1-rc-2-compatibility-audit.md)。

**v0.7.0+ 要求 DSH ≥ 0.2.0-rc.1**：

所有 `@deepseek-ai/dsh-*` peer 范围升到 `^0.2.0-rc.1`（devDependencies 同步）。无需改源码：DSH `0.1.7-rc.2` 到 `0.2.0-rc.2` 之间，本插件消费的每个包要么零改动，要么只是加法式变更。升级前有三点需要知道：

- **本包是 bundle 形态**（`dsh.bundle.patch`）。若宿主的插件兼容门拒收其 peer，宿主会跳过**整个 bundle**（`dsh: skipping profile bundle "dsh-user-approval-mode"`）—— 模式 chip 和"审批模式"设置页会一起消失，而不是只禁用某一行。
- **必须与宿主同批次发布。** `^0.2.0-rc.1` 不含 `0.1.7`，因此用该范围发布的插件会被 0.1.7 宿主拒收。宿主还在 0.1.7 线时请继续用插件 `0.6.0`。
- **不要写成 `^0.2.0` 或 `~0.2.0`**：这两个范围不含 prerelease，即使 `0.2.0-rc.2` 已存在也会被当下拒收。`^0.2.0-rc.1` 才能同时接纳今天的 `0.2.0-rc.*` 与将来的 `0.2.0` / `0.2.x`。

针对真实 0.2.0-rc 宿主的实机验证（安装门、冷启动、Web UI）推迟到宿主升级那一轮；0.7.0 本身按静态验证交付（`pnpm typecheck`、83 个测试、`pnpm build`）。

**DSH 0.1.0-rc.7 API 变更**：

DSH 在 `0.1.0-rc.7` 版本中对 `ctx.remote.commands.execute()` API 进行了破坏性变更：

- **旧版本** (≤0.1.0-rc.6): `execute(sessionId, line)` - 2 个参数
- **新版本** (≥0.1.0-rc.7): `execute(sessionId, line, images)` - 3 个参数，新增 `images` 数组

**影响**：
- ✅ 本插件已适配新版本 API（v0.1.2+）
- ⚠️ 旧版本插件（≤0.1.1）在 DSH 0.1.0-rc.7+ 上无法正常工作
- ⚠️ TypeScript 类型定义与实际 API 不一致（声称第三个参数是 `AbortSignal`，实际是 `images` 数组）

**技术细节**：
- 第三个参数 `images` 用于支持多模态命令（用户上传图片）
- 对于纯文本命令（如 `/approval-mode`），传递空数组 `[]` 即可
- 本插件使用类型断言绕过错误的 TypeScript 类型检查

详见 [`local-docs/lessons-learned/2026-08-20-commands-api-change.md`](local-docs/lessons-learned/2026-08-20-commands-api-change.md)。

### Composer 工具行布局

审批模式芯片注册在 composer 工具行的 `conversation.input.left` 座位，位于访问模式（权限）芯片旁边。当进入计划模式（`/plan`）时，平台会在 `conversation.input.plan` 座位渲染橘色的计划状态芯片 —— 该座位是平台命名的高占用（single）座位，harness 固定把它放在访问模式控件右侧 —— 因此计划框会出现在权限芯片与审批芯片之间。

这一顺序由平台布局固定：`ui-conversation` 的 `InputBar` 在 "modes" 簇内、`conversation.input.left` 条目之前渲染 `conversation.input.plan`。插件无法在不重画整个计划控件的前提下移动该座位，而移动它需要对 `ui-conversation` 做平台级改动，本插件刻意不做。保持现状。

### Smart 模式风险

Smart 模式在原有手动审批之上加了 LLM 驱动的自动审批环节。分类器是「尽力而为」的加速器，不是安全边界。具体：

- **LLM 可能误判。** 分类器可能把危险命令错认成例行而放行。13 条正则的危险清单作为硬底先于 LLM 跑（`rm -rf /`、`mkfs`、`curl|sh`、fork bomb 等），但无法枚举所有破坏性模式。仅在「最坏情况可恢复」的环境下使用 smart 模式。
- **没有「为何放行」的弹窗可见性。** 分类器或只读 git 快路径放行时，用户看不到提示；理由只落在 DSH 日志里（`[dsh-user-approval[smart]] decision=allow …`、`[dsh-user-approval[read-only-git]] decision=allow …`），分类器批准的 evidence 另在 LLM 请求 payload 里。
- **会话记忆只在进程内。** 记忆是 `Map<sha256(toolName + rawArguments), ...>` 的内存结构；DSH 重启即清空。重启后每个 shell 命令首跑都要重新付一次 LLM 成本。
- **成本按唯一 shell 调用计。** 每条 shell 命令首次跑消耗一次 LLM 调用；TTL 内的重复免费。若用户没填 `smartProvider`/`smartModel`，host 默认沿用主对话模型，成本会偏高——选轻量模型（以及模型支持时选更低的 reasoning 档位）可降本。
- **并发受 `smartSessionMemory` 容量限制。** 记忆按会话隔离，FIFO 上限 200 条；长会话周期性地把旧批准循环出去，那部分会重付 LLM 成本。
- **插件重载会排空在飞分类。** 插件拥有一个 `AbortController`，其 signal 注入所有在飞 LLM 调用；卸载时 abort + `Promise.allSettled` drain 之后，新插件实例才接手。卡住的请求不会跨重载污染下游。
- **两个 seam 都缺失时退回 ask。** 若 host 没有 `ctx.llm` 或 `ctx.agentDefaultModel`，smart 模式下每个 shell 调用都退回 ask（`detail: 'llm-unavailable'` 或 `'no-default-model'`）。分类器永远不会在「危险清单 + 分类器批准」之外的路径上静默放行。

### PTC preset（`run_code`）

agent preset 选 `ptc` 时，模型只能直接调用 `run_code`，其它原生工具只能作为程序内的 `tools.*` 绑定调用。插件的处理，以及它管不到的地方：

- **顶层先看代码。** `run_code` 仍在 `autoAllowTools` 里，但放行之前闸门先检查程序结构。两档语法宽度，姿态与只读 git 快路径一致——只认语法、绝不猜测：
  - **严格档**（永远放行）：整段程序只有 `tools.*` 调用、接结果的变量和 `return`——真正的动作是程序内每个子调用，它们带着 `parent` 和真实的工具名重新进入同一个 `tools/pre-execute` 闸门，按上表裁决。
  - **宽档**（默认开，设置页一个开关可关）：语句还可以是——无调用的纯表达式（算术、比较、模板拼接、字面量下标取值）；受识别的控制流（`if` / `for` / `while` / `switch` / `try`，条件和体递归套用同一套语法，循环体里藏 `rmSync` 照样弹窗），循环计数可赋值给程序自己声明的变量；白名单内建函数与方法（`Object.keys`、`Math.max`、`.map` / `.filter` / `.slice` / `.sort`、`JSON.parse` 等）作用于纯接收者，回调体同样递归检查（`list.map(x => rmSync('./x'))` 弹窗）。`tools.*` 子调用藏在哪都照样逐个过闸，所以受识别的代码读不了文件、连不了网、调不了任何没被识别的东西。import、`new`、动态取成员、遮蔽 `tools` 绑定的声明、不在白名单上的任何调用，request / auto-edit 下仍弹窗审批（`runCodePureExpressions` 关掉即恢复严格档）。
  smart 下同一个裁决是五步流水线内部的快放：排在危险清单之后（部署方配的 pattern 不可被语法绕过）、LLM 之前——被识别的程序不再调 LLM，源码也不会外发给第三方模型；其余照旧走流水线，分类器收到的证据按下一条所述分桶。yolo / off 不检查。每次闸门放行都记一行可 grep 的日志：
  `[dsh-user-approval[run-code-gate]] decision=allow detail=<verdict>`。
- **分类器看到的是分桶后的程序。** smart 下未被识别的程序送 LLM 前，先经 `src/run-code-strip.ts` 把程序里受闸的 `tools.*` 子调用替换成 `[gated sub-call]` 占位符：每个子调用执行时都带着真实工具名和真实参数值各自过闸，分类器审的是子调用之外的直接代码——import、直调、数据拼装——而不是替别的审查者重复裁决。分桶保守、失败向安全侧：程序里出现遮蔽 `tools` 的绑定、`eval` / `Function` 引用、动态 `import()`、任何成员写入（含 `globalThis`）、或对象反射劫持面（`Object.assign`、`Object.defineProperty`、`Reflect.set` 等）时**不分桶**，分类器看到原始程序。危险清单的匹配文本、会话记忆的 key、弹窗的 `[code: …]` 摘要都继续用原始源码，evidence 也不再经 `toolArguments` 把整段程序重发一遍。每次分桶或放弃都记一行可 grep 的日志：`[dsh-user-approval[run-code-strip]] decision=strip count=N` 或 `decision=abort reason=<why>`。
- **顶层弹窗补代码。** 宿主审批面板对 `run_code` 不显示任何命令块，所以顶层 ask 在文案末尾追加 `[code: …]` 单行摘要（压平空白、截断 200 字符），和默认模板一样走 `displayReason` 双语通道。
- **子调用弹窗补参数。** 宿主的审批面板只解析顶层工具节点的 `command`；PTC 子调用是 `run_code` 节点的嵌套子调用，面板看不到参数。插件因此在子调用的 ask reason 末尾追加 `[args: …]`（bash 显示命令、write 显示路径，其余显示 JSON；单行、截断 200 字符）。原生调用的 reason 不变。混合代码可能弹两次——顶层问一次代码、里面的子调用再各问一次——这是堵住静默 `rmSync` 的已接受代价，后续版本可能合并。
- **直连 Node 的效果不受子调用闸门约束。** 程序里 `import('node:fs')`、`node:child_process` 直接读写文件，不经过工具调用，插件看不到。request / auto-edit 下这类程序现在会在顶层被拦下弹窗（白名单只看语法）；smart 下走 LLM 分类器，仍可能被骗。唯一硬边界是沙箱模式（切模式时联动写入的 `workspace-write` 等，见[配置选项](#配置选项)里的 `sandboxDefaults`）。因此 PTC preset 下 request 模式**不等价于**「每次写盘都要批准」。
- **被拒与超时。** 子调用被拒只让该绑定抛 `ToolCallError`，程序可以 catch 后重试或换路，每次重试都会重新过闸。审批等待计入 `run_code` 的运行预算（默认 120 秒、上限 600 秒），大量审批可能让程序在等待中被中止。
- **逃生舱。** 从 `autoAllowTools` 删掉 `run_code`，恢复「每个程序盲弹一次」且不做代码检查（弹窗里仍看不到程序代码，因为宿主的审批面板只显示 shell 命令）。模型直接调用被折叠的原生工具时，宿主在进入闸门之前就拒绝——这既不是插件放行，也不是插件拦截。

需要严格逐次写盘审批的会话，不要用 PTC preset；确实要用时，把沙箱收紧到 `read-only`，或者接受上述边界。

## 自定义审批弹窗文案

工具需要审批时弹窗里显示的文本来自 `askReason` 模板。默认文案短而结构化 ——
弹窗卡片自带「等待审批」状态条和允许 / 拒绝按钮，标题只需回答「谁、为何
触发弹窗」：

```
[{family}] Tool: {tool} | Mode: {mode}
```

默认模板**自带双语**：中文 UI 经宿主 `displayReason` 通道显示
`[{family}] 工具: {tool} | 模式: {mode}`（DSH 0.2.1-rc.2 起支持，即本插件
peer 下限；更旧宿主忽略该字段、退回英文），会话日志仍记英文。需要完全自定义
措辞时在 `cordis.yml` 里覆盖 —— 自定义模板单语原样显示（不附带中文变体）：

```yaml
- insert:
    - id: dsh-user-approval-mode
      name: dsh-user-approval-mode
      config:
        askReason: '⚠️ 工具 {tool} 需要您的批准（当前模式：{mode} | 工具类型：{family}）'
```

可用占位符：`{tool}`（工具名）、`{mode}`（当前审批模式）、
`{family}`（edit | shell | readonly | other）。

PTC 程序内的工具子调用会在模板渲染结果之后追加 `[args: …]`（命令或路径摘要，
单行、截断 200 字符），因为宿主弹窗无法显示嵌套调用的参数；顶层 `run_code`
的 ask 追加的是 `[code: …]`（程序文本摘要，同样单行、截断 200 字符），因为
弹窗对 `run_code` 连命令块都不显示。这两段后缀对两种语言版本同样生效、不可
配置、也没有占位符控制它；原生调用不会附加。

**自定义文本仍是手动的事**：默认模板的中文版是内置的，但自定义 `askReason`
只是一个纯字符串 —— 服务端在弹窗那一刻没有 locale 信号（语言设置住在
客户端），需要非英文自定义文案的部署方直接在配置里写。输入框下方那个模式
选择芯片通过 DSH 的 locale 服务独立本地化（见 `src/client/locales.ts`）。

**`askReason` 内的内联颜色或标记无效**：上游审批弹窗把 reason 当作纯字符串
渲染，没有标记通道 —— 模板里给某段文字加颜色或样式不会生效。换行也不会
渲染成多行：弹窗标题会把 `\n` 折叠成空格，模板保持单行。标题下方的命令
详情块同样如此：虽然是等宽字体，但换行一样被折叠，多行 bash 命令在弹窗里
会显示成一行。这是上游弹窗的渲染限制（宿主 `ui-approval` 的 CSS 缺
`white-space: pre-wrap`），插件侧无法自行修复；PTC `[args: …]` 摘要之所以
主动折叠空白，也是这个原因。

## 设置页面

打开 Web UI 侧边栏 → **设置** → **审批模式**（最底部，Plugins 之后）即可
编辑本插件暴露的十个用户可编辑 Config 字段。页面分为四个子区块：

1. **工具族分类** —— 每个族（`editTools`、`shellTools`、`readOnlyTools`、
   `autoAllowTools`）一个逗号分隔的文本输入框，外加只读 git 快路径的开关
   （`readOnlyGitCommands`）与 `run_code` 纯表达式宽语法的开关
   （`runCodePureExpressions`，见 PTC preset 一节）。值按集合处理：顺序无
   所谓，提交时自动去重。
2. **Sandbox 策略** —— 每个模式（`request`、`auto-edit`、`yolo`）一个
   下拉框。下拉标签在 `en` 与 `zh` 两种 locale 下都显示英文（值是与
   schema 共用的技术标识符）。
3. **Smart 分类器** —— provider / model / reasoning 档位三个下拉框，选项来自
   宿主当前公布的模型目录（见下）。
4. **审批弹窗** —— `askReason` 单行文本模板

Smart 分类器的三个下拉框读取宿主模型目录（`session/modelCatalog`）：页面首次
渲染时加载，LLM 注册表变化（`llm/adapters-updated`、`llm/models-updated`）或
连接重置时重读。已保存但宿主不再公布的路由会保留在列表里并标注「不在当前目录
中」，不会被静默改写。provider 与 model 是耦合的：选了具体 provider 就会同时
选定它公布的一个模型；选「继承宿主默认」会一并清空三个字段；档位只在该模型
保持不变且仍然公布它时才保留。

其余 Config 字段（`default`、`unclassified` 以及六个 `smart*` 部署方旋钮）
刻意保持为**仅部署方可配**：写在部署方的 cordis 配置里、不出现在设置页面。
运行时这些值直接取自 cordis `base`。

每个字段都带：

- 内联描述 —— 显示在字段下方的独立行小字（来自 schemastery 字段描述）；
  撑满整行宽度，不会被挤在 label 下面
- **重置**按钮 —— 清除该字段的用户覆盖、恢复到部署方在 `cordis.yml` 中
  设置的值（即 settings 的 `base` 层）
- 本地化标签与描述（默认 `en` + `zh`；增加语种请扩展 `src/client/locales.ts`）

### 层次模型

用户可编辑字段在插件入口 schema 上声明为 `.volatile()`。解析值经过三层：

```
schema 默认  →  cordis `base`（部署方的 cordis 配置）  →  用户覆盖
```

用户覆盖持久化到 profile `cordis.patch.yml` 的 user 层（entry id
`dsh-user-approval-mode`），由运行时 live 应用。用户未编辑的字段值取自
部署方的 cordis 配置；用户编辑过的字段值取用户层。Reset 清除用户覆盖
（让部署方的 base 重新浮现）。

### 用户可编辑字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `editTools` | 逗号分隔文本（集合） | auto-edit 模式下自动放行 |
| `shellTools` | 逗号分隔文本（集合） | request / auto-edit 模式下都要审批 |
| `readOnlyTools` | 逗号分隔文本（集合） | 任何模式都放行 |
| `autoAllowTools` | 逗号分隔文本（集合） | 与族无关、直接绕过审批（默认含 `run_code`，见 PTC preset） |
| `readOnlyGitCommands` | 开关 | 严格解析后的只读命令（或命令链，外加 `echo "…"` 行）免审（默认开） |
| `runCodePureExpressions` | 开关 | 顶层 `run_code` 程序的宽语法免审（纯表达式、受识别控制流、回调经检查的白名单方法）；smart 下同时是分类器之前的快放。关掉恢复严格语法（默认开） |
| `sandboxDefaults` | 每模式下拉框 | 切到该模式时联动写入的 sandbox 策略 |
| `askReason` | 多行文本 | 审批弹窗文案模板（占位符：`{tool}` / `{mode}` / `{family}`） |
| `smartProvider` | 下拉框 | smart 分类器的 LLM provider，从宿主公布的 provider 里选（「继承宿主默认」= 跟随 `agentDefaultModel`） |
| `smartModel` | 下拉框 | smart 分类器的模型，只列所选 provider 公布的模型 |
| `smartReasoningEffort` | 下拉框 | 分类调用的 reasoning 档位，仅模型公布档位时可选（「模型默认」= 不下传该选项） |

仅部署方可配（不在页面展示，写在 `cordis.yml`）：

- `default` —— 新会话的默认模式
- `unclassified` —— `'ask'` / `'allow'`，工具不在任何族时的行为

### 生效时机

十个用户可编辑字段都是 **live** —— 下一次 `tools/pre-execute` 即生效，
无需重启 DSH。运行时闸门每次工具调用都会重读 live 的 volatile Config。

### 族名单之间的重叠

`editTools`、`shellTools`、`readOnlyTools` 应**互不相交**——一个工具名应
最多出现在一个族里。UI 里会显示提示文案提醒；如果用户不小心把同一个工具
放进两个族，运行时仍按确定性的优先级裁决（`edit > shell > readonly`）。
`autoAllowTools` 是这个规则的例外：它先于族分类被检查，与任何族名单重叠
无副作用（冗余但不冲突）。

## 配置

### 基本使用（使用所有默认值）

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval-mode
```

以下就是插件的 schema 默认值（`src/index.ts`）；本包随附的 bundle patch
（`cordis.patch.yml`）逐字重复同一份名单，所以"装 bundle"和"手动 insert"
生效的行为完全一致：
- `default`: `off`（默认禁用插件）
- `editTools`: `['write', 'edit', 'str_replace_editor', 'update_goal']`
- `shellTools`: `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']`
- `readOnlyTools`: `['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'list_subagent_models', 'schedule_list', 'schedule_view', 'working_directory', 'list_agents', 'job_list', 'get_goal']`
- `autoAllowTools`: `['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'subagent_fork', 'present', 'wait_agent', 'send_message', 'job_kill', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update', 'run_code', 'mnemon_document_create', 'mnemon_document_manage', 'mnemon_document_search', 'mnemon_forget', 'mnemon_link', 'mnemon_memory_bodies', 'mnemon_memory_body_create', 'mnemon_memory_body_merge', 'mnemon_memory_body_update', 'mnemon_recall', 'mnemon_related', 'mnemon_remember', 'mnemon_runtime_memory', 'mnemon_status', 'mnemon_subagent_result', 'mnemon_view_action', 'mnemon_view_route']`
- `unclassified`: `ask`

默认值里带上较新的 Agent Teams / dsh-mnemon 工具名是安全的：host 没注册的
工具名永远不会被匹配到。这四份名单由 `test/tool-family-defaults.test.ts` 钉住。

已兼容 `dsh-mnemon`：其全部 17 个 `mnemon_*` 工具默认免审，启用记忆插件的
会话不会再为它们弹审批。

### 自定义配置

可以在 agent preset 中自定义插件行为：

```yaml
- insert:
    - id: approval-modes
      name: dsh-user-approval-mode
      config:
        # 新会话的默认模式
        default: auto-edit
        
        # 自定义工具分类（下面列的就是出厂默认值）
        editTools: ['write', 'edit', 'str_replace_editor', 'update_goal']
        shellTools: ['bash', 'pwsh', 'tool:bash', 'tool:pwsh']
        readOnlyTools: ['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'list_subagent_models', 'schedule_list', 'schedule_view', 'working_directory', 'list_agents', 'job_list', 'get_goal']
        autoAllowTools: ['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'subagent_fork', 'present', 'wait_agent', 'send_message', 'job_kill', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update', 'run_code', 'mnemon_document_create', 'mnemon_document_manage', 'mnemon_document_search', 'mnemon_forget', 'mnemon_link', 'mnemon_memory_bodies', 'mnemon_memory_body_create', 'mnemon_memory_body_merge', 'mnemon_memory_body_update', 'mnemon_recall', 'mnemon_related', 'mnemon_remember', 'mnemon_runtime_memory', 'mnemon_status', 'mnemon_subagent_result', 'mnemon_view_action', 'mnemon_view_route']
        
        # 未分类工具的策略：'ask'（更安全）或 'allow'（更快）
        unclassified: ask
        
        # 各模式的沙箱策略
        sandboxDefaults:
          request: workspace-write
          auto-edit: workspace-write
          yolo: workspace-write
        
        # 自定义审批原因消息（默认模板自带中文展示版）
        askReason: '[{family}] Tool: {tool} | Mode: {mode}'
```

### 禁用插件

```yaml
- id: approval-modes
  disabled: true
```

## 配置选项

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `default` | string | `off` | 新会话的默认审批模式。选项：`request`、`auto-edit`、`smart`、`yolo`、`off` |
| `editTools` | string[] | `['write', 'edit', 'str_replace_editor', 'update_goal']` | 分类为"编辑"族的工具（文件修改） |
| `shellTools` | string[] | `['bash', 'pwsh', 'tool:bash', 'tool:pwsh']` | 分类为"Shell"族的工具（命令执行） |
| `readOnlyTools` | string[] | `['read', 'glob', 'grep', 'read_image', 'list_directory', 'todo_write', 'list_subagent_models', 'schedule_list', 'schedule_view', 'working_directory', 'list_agents', 'job_list', 'get_goal']` | 分类为"只读"族的工具（始终允许）。`working_directory` 归只读族：沙箱权限根不变，只有相对路径解析跟随新目录 |
| `autoAllowTools` | string[] | `['ask_user_question', 'exit_plan_mode', 'job_output', 'skill', 'subagent', 'subagent_fork', 'present', 'wait_agent', 'send_message', 'job_kill', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update', 'run_code', + 17 个 `mnemon_*` 名]` | 始终绕过审批的工具。`run_code` 在此是因为 PTC preset 下它是传输层：顶层调用先按程序代码结构裁决（纯 `tools.*` 程序放行交给子调用闸门，其余 JS 弹窗），程序内子调用仍逐个过闸；删掉它则改为「每个程序盲弹一次」、不做代码检查。dsh-mnemon 的 17 个 `mnemon_*` 工具也默认在此——开箱已兼容 dsh-mnemon；删掉这些名字可改为弹窗 |
| `unclassified` | string | `ask` | 未分类工具的策略：`ask`（需要审批）或 `allow`（自动批准） |
| `readOnlyGitCommands` | boolean | `true` | 放行严格解析后的只读命令链而不再弹窗（见[只读 git 命令](#只读-git-命令)）。同时是设置页开关；用户覆盖叠加在该 base 之上 |
| `runCodePureExpressions` | boolean | `true` | 放行顶层 `run_code` 程序的宽语法——纯表达式、受识别控制流、回调经递归检查的白名单方法（见 PTC preset 一节；smart 下同时是分类器之前的快放）。同时是设置页开关；用户覆盖叠加在该 base 之上 |
| `sandboxDefaults` | object | `{request: 'workspace-write', auto-edit: 'workspace-write', smart: 'workspace-write', yolo: 'workspace-write'}` | 各审批模式的沙箱模式 |
| `askReason` | string | `[{family}] Tool: {tool} \| Mode: {mode}` | 审批请求的消息模板。支持 `{tool}`、`{mode}`、`{family}` 占位符。默认自带双语（zh UI 显示内置中文版，日志记英文）；自定义模板单语原样显示 |
| `smartProvider` | string \| null | `null` | smart 模式分类器的 LLM provider（null = 继承 `agentDefaultModel`）。设置页只列宿主当前公布的 provider；部署方仍可在此固定一个 |
| `smartModel` | string \| null | `null` | smart 模式分类器的 LLM model（null = 继承 `agentDefaultModel`）。设置页只列所选 provider 公布的模型 |
| `smartReasoningEffort` | string \| null | `null` | 单次分类调用使用的 reasoning 档位（null = 不下传该选项，沿用模型默认档位）。模型不认的档位会让调用失败，分类器按 fail-safe 转人工复核 |

上表 `默认值` 列就是插件的 schema 默认值（`src/index.ts`），随附的 bundle
patch 逐字重复同一份名单——装 bundle 与手动 insert 的行为一致。

### 默认审批原因

```
[{family}] Tool: {tool} | Mode: {mode}
```

中文 UI 显示内置中文版 `[{family}] 工具: {tool} | 模式: {mode}`（宿主
`displayReason` 通道）；会话日志仍记英文。

## 工具族分类

插件自动将工具分为四个族：

| 族 | 默认工具 | 行为 |
|------|---------|------|
| **编辑** | `write`, `edit`, `str_replace_editor`, `update_goal` | 文件修改工具 |
| **Shell** | `bash`, `pwsh`, `tool:bash`, `tool:pwsh` | 命令执行工具 |
| **只读** | `read`, `glob`, `grep`, `read_image`, `list_directory`, `todo_write`, `list_subagent_models`, `schedule_list`, `schedule_view`, `working_directory`, `list_agents`, `job_list`, `get_goal` | 安全浏览工具（始终允许） |
| **其他** | *所有其他工具* | 未分类工具，行为取决于 `unclassified` 配置 |

`run_code` 是 PTC preset 的传输层，刻意不放进任何族：它默认在 `autoAllowTools`
里，审批落在顶层代码检查（见上文 PTC preset）加程序内每个子调用上（子调用带
真实工具名，按上表裁决）。把它加进族名单不会改变结果（`autoAllowTools` 先检
查），只有从 `autoAllowTools` 删掉它，才会改为拦程序本体。

### 只读 git 命令

代理日常的 shell 调用里有很大一部分是只读的 git 查看（`git status`、
`git log`、`git diff` 等）。它们属于 Shell 族，于是 request / auto-edit 每条都
弹窗，smart 每条都花一次 LLM 调用。**只读命令快路径**把它们豁免掉。

只要每一环都是「严格解析后的只读调用」，整条命令就豁免；其余一律照旧弹窗：

- **放行形式** —— `git status`、`git log`、`git diff`、`git show`、
  `git rev-parse`、`git rev-list`、`git describe`、`git shortlog`、
  `git show-ref`、`git for-each-ref`、`git ls-files`、`git ls-tree`、
  `git blame`、`git name-rev`、`git merge-base`、`git count-objects`，以及
  `git branch` / `git tag` / `git remote`（`-v`、`get-url`）/
  `git stash list|show` / `git worktree list` / `git submodule status|summary`
  的列表形式。允许 `git -C <path>` 与 `--no-pager` 前缀。
- **命令链** —— 用 `;` `&` `|` `&&` `||` 或换行连接的链，**只有每一环单独都
  豁免时才豁免**：`git status && echo "=== DIFF ===" && git diff --stat` 免审，
  `git status && rm -rf /` 不免审。`echo "…"` 是表里唯一的非 git 命令——它的
  参数只是文本，因为重定向（它唯一能写文件的途径）永远不匹配。
- **永不放行** —— 任何重定向（`>`、`>>`、`<`、`2>&1`）、任何替换（`$(…)`、
  反引号）、任何带引号的 **git** 参数（引号里的 flag 名会躲过 flag 检查）、
  管道接到非 git 命令（`git log | head`）、被包装（`sudo`、`env`、`sh -c`）
  或带环境变量前缀的命令、`cd repo && git status`、任何配置/路径类全局选项
  （`-c`、`--config-env`、`--exec-path`、`--git-dir`、`--work-tree`）、
  `--output*` / `--ext-diff` / `--textconv`、上述子命令的写形式
  （`git branch foo`、`git tag v1`、`git stash`、`git remote add …`）、
  被排除的 `config` / `symbolic-ref` / `grep` / `cat-file`，以及所有网络类
  （`fetch`、`pull`、`clone`、`ls-remote`、`remote show`）。
- **总开关** —— 在设置页把 `readOnlyGitCommands` 关掉，恢复 request /
  auto-edit 下「shell 一律弹窗」（同时移除 smart 模式的这条短路）。同一字段
  也可作为部署方 base 写在 `cordis.yml`；用户覆盖优先于 base，该行 Reset
  则回落到 base。
- **日志** —— 每次快路径放行都会写
  `[dsh-user-approval[read-only-git]] decision=allow detail=<标签>`，标签或是
  单条（`detail=status`），或是整条链（`detail=status + echo + diff`）。
- **已知天花板** —— `diff` / `log` / `show` / `blame` 在仓库配置了 textconv
  过滤器或外部 diff 驱动时仍会执行那个外部程序，因为这是 git 自己的行为、
  命令文本判不出来。只有显式的 `--ext-diff` / `--textconv` 会被拒。理由与
  被否决的替代方案见
  [ADR 0003](docs/adr/0003-read-only-command-fast-path.md)。

## 自带 skill

包内随附一个代理 skill：`dsh-approval-shell-style`。它从代理视角描述本插件
的闸：哪些工具永远免审、只读 git 链怎么写成快路径能解析的形式、哪些调用仍会
弹窗、被拒之后怎么处理。

- **出现在哪里** —— 挂载了本插件的 profile 里，每个会话的技能目录
  （`<available_skills>`）与 Web 技能列表；
  `skill({ name: "dsh-approval-shell-style" })` 按需加载。不会写入
  `~/.dsh/skills` 或工作区。
- **生命周期** —— 插件挂载期间通过可选的 `skills` 服务注册，卸载/停用时反
  注册，不残留文件；历史会话只保留当时的目录消息。
- **覆盖** —— 项目级（`.dsh/skills`、`.agents/skills`）与用户级
  （`~/.dsh/skills`、`~/.agents/skills`）skill 的 rank 更高，同名本地 skill
  会覆盖插件版（插件版 rank 600）。
- **打包** —— `skills/` 必须在 `files` 白名单里；漏掉时插件照常加载但只打一
  条警告、不贡献 skill（与漏掉 `cordis.patch.yml` 同类的安装路径缺陷）。
- **PTC 契约** —— skill 也说明 PTC preset 下的规则：顶层 `run_code` 程序是纯
  `tools.*` 调用、受识别的纯运算/控制流/白名单方法时免弹（其余 JS 要弹；设置页开关可关掉
  宽档）、程序内 `tools.*` 绑定调用逐个
  过闸、绑定被拒抛 `ToolCallError` 后不要换路绕过。

## 工作原理

1. **工具执行拦截**：插件监听 `tools/pre-execute` 事件
2. **PTC 代码检查**：顶层 `run_code` 先按程序代码结构裁决——纯 `tools.*` 程序与（按 `runCodePureExpressions` 开关）受识别的纯运算、控制流、白名单方法放行交给子调用闸门，其余 JS 在 request/auto-edit 下弹窗（附 `[code: …]` 摘要）；smart 下同一裁决在危险清单之后、分类器之前快放；程序内子调用回到第 1 步，用真实工具名重新过闸
3. **族分类**：确定工具属于哪个族
4. **只读快路径**：属于 shell 族、但每一环都是严格解析后的只读命令的调用，直接放行
5. **模式检查**：评估当前审批模式
6. **决策**：对需要审批的工具返回 `{ kind: 'ask' }`，或允许执行。PTC 子调用的 ask reason 末尾追加参数摘要；顶层 `run_code` 的 ask 追加代码摘要
7. **沙箱同步**：切换模式时自动调整沙箱策略
8. **状态存储**：审批模式使用内存存储（WeakMap），DSH 重启后恢复默认
9. **UI同步**：Web UI 芯片通过 React 管理状态，刷新时从服务器同步

## 依赖

- `@deepseek-ai/cordis`：插件框架
- `@deepseek-ai/dsh-tools`：工具定义工具
- `@deepseek-ai/dsh-sandbox`：沙箱模式类型
- `@deepseek-ai/dsh-sandbox-policy`：沙箱策略管理
- `@deepseek-ai/dsh-session`：会话管理
- `@deepseek-ai/dsh-settings`：设置集成
- `@deepseek-ai/dsh-commands`：命令注册
- `@deepseek-ai/dsh-session-projection`：会话投影（用于 UI）
- `@deepseek-ai/schemastery`：配置 schema 验证
- `acorn`：PTC `run_code` 代码结构闸门的 JS 解析器
- `dsh-tool-list-dir`：推荐的只读目录浏览工具

## 相关项目

- [dsh-tool-list-dir](https://github.com/R-LEI2536/dsh-tool-list-dir) - 只读目录列表工具，推荐与此插件配合使用

## 许可证

MIT

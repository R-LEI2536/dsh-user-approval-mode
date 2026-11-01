# dsh-user-approval-mode v0.10.0 升 DSH v0.2.1-rc.5 兼容性审计

**日期**: 2026-11-01
**审计基线**: 本仓 `main` = `ab73654`（v0.9.0，rc.2 线）；上游对照 `deepseek-harness` = `dsh-v0.2.1-rc.2`（`687f282e86`）↔ `dsh-v0.2.1-rc.5`（`b830ec95`，rc.5 tag 已 fetch 到本 checkout）
**审计目标**: `dsh-user-approval-mode` 从 DSH `0.2.1-rc.2` 线升到 `0.2.1-rc.5` 线（devDependencies 与文档），并复核是否需要改源码
**审计依据**: `deepseek-harness/DSH-0.2.1-rc.5-插件升级指南.md`；本仓 `llm-workflows/2026-09-09-dsh-upgrade-audit-workflow.md`；rc.2→rc.5 逐提交 git diff（19 提交 / 667 文件，`+6097 −1091`）；本轮新增 2 篇官方指南（`v0.2.1-rc.2/new-session-blank-reuse`、`v0.2.1-rc.4/reasoning-body-props`）
**审计范围**: 仅本插件（单仓）；宿主升级、舰队其余仓、已弃用插件不在本次范围
**审计结论**: ✅ **`src/**` / `test/**` / `cordis.patch.yml` / `lib/**` 零改动**；改动仅限 `package.json`（版本号 + 15 条 devDependencies）、`pnpm-lock.yaml`、文档
**本轮交付状态**: **L1（依赖解析）与静态验证（typecheck / test / build / 门谓词 / §6.1 grep）已实测通过**；**L2 / L4 / L5 / L6 实机验证本轮未执行**，可执行清单见 §7。未标注「已实测」的实机项一律视为未验证。

---

## 一、本地基线状态

| 项目 | 值 |
| --- | --- |
| 本仓基线 HEAD / 分支 | `ab73654` / `main`（rc.2 升级已合入） |
| 本轮工作分支 | `feature/dsh-0.2.1-rc.5-upgrade`，worktree `.worktrees/dsh-0.2.1-rc.5`（`.git/info/exclude` 本地排除，`main` 源码零 diff） |
| 插件版本（改动前 → 后） | `0.9.0` → `0.10.0` |
| peer `@deepseek-ai/dsh-*` | 15 条（`package.json:34-48`），**保持 `^0.2.1-rc.2` 不变** |
| dev `@deepseek-ai/dsh-*` | 15 条（`package.json:54-68`），`^0.2.1-rc.2` → **`^0.2.1-rc.5`** |
| 底座 | `@deepseek-ai/cordis >=4.0.5`、`@deepseek-ai/schemastery >=3.18.5`，两树均未变 |
| 不动项 | `react ^18.2.0`、`zod ^4.4.3`、`@rh854lkjd/dsh-tool-list-dir >=0.2.7`、`exports`、`files`、`scripts` |
| 形态 | `dsh.bundle.patch` = `./cordis.patch.yml` ⇒ **bundle 包**（门禁失败跳过整包） |
| 包管理器 | Node v24.18.0，pnpm **11.28.5**，`lockfileVersion: '9.0'`，`autoInstallPeers: true` |
| 运行中宿主（本轮全程未重启） | `dsh` = `0.2.1-rc.2` checkout，本次未安装/未启动 rc.5 宿主 |

---

## 二、结论与改动

1. `package.json`：`version` → `0.10.0`；15 条 devDependencies `^0.2.1-rc.2` → `^0.2.1-rc.5`；**15 条 peer 不动**；未引入 `engines.dsh`（本仓策略：有 peer 就靠 peer 门）。
2. `pnpm-lock.yaml`：重解到 rc.5 家族。`0.2.1-rc.5` 出现 **271** 次、`0.2.1-rc.2` **0** 次、`specifier: ^0.2.1-rc.5` **15** 条；diff 为 387 增 / 387 删，逐行核对后全部是 `@deepseek-ai/dsh-*` 版本号与对应 integrity，无包增删、无范围漂移。`@rh854lkjd/dsh-tool-list-dir` 仍锁 `0.3.3`（未在本次范围内升级）。
3. `CHANGELOG.md` / `README.md` / `README.zh.md` / `CONTEXT.md` 同步，新增本审计文档。
4. **无源码改动**：逐包对照见第三节；`pnpm typecheck` 面对真实 rc.5 类型**零错误**，直接印证这一点。
5. **`lib/` 不重建**：`src/` 零改动 ⇒ 产物无需变动；在 rc.5 依赖下重建只有路径相关噪声（§5.1），已回滚。

### 2.1 范围决策：peer 为什么不动

指南 §4.2 对本插件的判定是「15 个 peer `^0.2.1-rc.2` 已经覆盖 rc.5」。范围语义 `^0.2.1-rc.2` ⇒ `>=0.2.1-rc.2 <0.3.0-0`，与 `0.2.1-rc.3/rc.4/rc.5` 同属 `0.2.1` prerelease 元组，**全部匹配**。因此：

- **peer 不动**：抬高到 `^0.2.1-rc.5` 只会收窄可装宿主（拒收 rc.2/rc.3/rc.4），而源码在本走廊零改动、行为对 rc.2–rc.5 一致，没有任何收益。保持 `^0.2.1-rc.2` 让**同一份已发布产物**可装 rc.2 到 rc.5+，回滚宿主也不需要重发插件。
- **devDeps 必须抬**：否则本地 typecheck 仍对着 rc.2 类型跑，等于没验。这是本轮唯一实质的依赖改动。
- **指南建议的可选写法 `^0.2.1-rc.1` 被拒绝**：它会把 `0.2.1-rc.1` 宿主也放进来，而该宿主线本插件从未验证过；本仓既定策略是把下限钉在验证过的线上（见 `CONTEXT.md` §"DSH dependency line"）。本轮的验证线已从 rc.2 推进到 rc.5，下限仍保持 rc.2。

**与 v0.9.0 的关键差别**：v0.9.0 把 peer 下限从 `^0.2.0-rc.1` 抬到 `^0.2.1-rc.2`，属于「插件与宿主必须同批次升级」；本轮 peer 未动，**当前 rc.2 宿主继续接受 v0.10.0**，因此合并到 `main` 不要求宿主先升 rc.5。

### 2.2 为什么 `lib/` 不重建

`CONTEXT.md` §Distribution 规定：`lib/` 随 `src/` 改动重建并提交。本轮 `src/**` 零改动 ⇒ 不满足重建条件。实测在 rc.5 依赖下 `pnpm build` 后 `lib/` 出现 30 增 / 30 删，逐 hunk 核对为：

1. `//#region \0dsh-css:<绝对路径>` 注释随构建目录变化（worktree 路径 ≠ 主 checkout 路径）；
2. CSS Modules 类名 hash 由 `lightningcss` 依传入 `filename` 派生（`tsdown.config.ts` 的 `pattern: '[hash]_[local]'`），并受 lightningcss 版本影响（本次安装 1.33.0，已提交产物由 1.27 线生成，字形不同：`FATkTq_*`/`DxQiRa_*` → `_8aP6na_*`/`UCXx5W_*`）；
3. CSS 规则文本、JS 结构、组件逻辑逐字节一致；CSS 文本与 JS 类名映射使用同一前缀，构建内部自洽。

⇒ 差异是构建工具行为（路径 + lightningcss 版本），**不是依赖抬版引起的语义变化**，已在 worktree 执行 `git checkout -- lib/` 回滚。

---

## 三、上游逐包对照

证据：`git -C deepseek-harness diff dsh-v0.2.1-rc.2..dsh-v0.2.1-rc.5 -- <包目录>`，并对关键文件用 `git cat-file` 与 rc.5 快照做逐字节抽检（§8.1）。

### 3.1 指南 §3 逐条判定（本插件）

| 指南条目 | 判定 | 证据 |
| --- | --- | --- |
| §3.1 版本范围硬门 | **不命中**（范围已覆盖） | 插件无 `engines.dsh`（`package.json`），门走 15 条 peer；实测 rc.5 15/15 通过（§4）；门实现 `app-boot/src/plugin-compatibility.ts` 两版逐字节同 |
| §3.2 `send_button_click` 必填 `is_new_session` | **不命中** | `grep -rn "send_button_click\|product-analytics" src/` = 0；插件无客户端埋点 |
| §3.3 `TooltipSide` 联合加宽 / 穷尽 switch | **不命中** | `src/` 无 `Tooltip`/`TooltipSide`/`assertNever` 引用（0 命中）；只消费 `Menu`/`IconChevronDownOutlineRegular`，两者 rc.5 仍在 |
| §3.3 `sidebar_menu_click.menu_name` 扩宽 | **不命中** | 无该埋点事件 |
| §3.3 `pluginNavigation` 增 `openList` | **不命中** | 不 provide 该服务，只消费 `ctx.remote.commands` |
| §3.3 `ConversationSessionHeaderInjected` / `SidebarRootInjected` 增必填成员 | **不命中** | 不实现注入面；只注册 `conversation.input.left` 与 `settings.section`（`src/client/index.ts:89,147`） |
| §3.3 删除 locale key `conversation.session.moreViewsCurrent` | **不命中** | 只用自有命名空间 `dsh-user-approval-mode*`（`src/client/index.ts:52-54`），不引用官方 `ConversationKey`。附注：rc.2 树中也搜不到该 key，rc.5 反而新增 `session.moreViews`（`ui-conversation/src/client/locales.ts:81`） |
| §3.3 `MessageSubmissionState` 增必填 `newSession` | **不命中** | 不构造提交状态；模式切换走 `/approval-mode` 命令通道 |
| §3.4 推理正文 `rawText`/`text` 语义变化 | **不命中** | 无 reasoning 渲染，不消费 `conversation.chat.reasoning.*` slot |
| §3.4 `startSession()` 空白会话复用 / `whenDraftExists` | **不命中** | `src/` 无 `startSession`/`clearPreviousDraft`/`whenDraftExists` 引用（0 命中）；插件不创建会话 |
| §3.4 View tab / 面板入口折叠进 More | **不命中** | 不注册 `conversation.session.header.views.actions` / `sidebar.panellist.actions`；composer chip 与 `settings.section` 不在折叠范围 |
| §3.4 pin 纯内存态 | **不命中** | 不注册 view/入口 pin |
| §3.5 DeepSeek `/models` listing 跟随官方目录 | **低风险间接** | 插件只 cast `ctx.get('llm')` 调 `stream`（`src/index.ts:356`）；`llm/llm` 本走廊零改动，listing 发生在 `llm-deepseek-api-key` 的 transport 内部，不改插件契约；内置模型 id 未变（`llm-deepseek/src/models.ts:10-21` 仅 contextWindow 调整） |
| §3.5 诊断日志移出 stdout | **已合规** | host 侧只用 `ctx.logger.info`（`src/index.ts:304,323`）；`src/client/**` 的 `console.*` 属浏览器控制台，不是 ACP stdout |
| §3.5 共享 transport 新导出 | **不命中** | 纯增量，插件不 import |
| §3.6 三个 actions slot / `openList` / 新图标 / 新埋点 | **不命中** | 全部可选；本插件不使用 |

### 3.2 逐包差异（rc.2 → rc.5）

| 包（消费点） | rc.2→rc.5 变更 | rc.5 状态 |
| --- | --- | --- |
| `dsh-session`（`Session`/`SessionEvent`/`snapshotEvents`） | 仅 `package.json` | 同形（`core/session/src/index.ts:522,725`、`types.ts:494`） |
| `dsh-sandbox`（`SandboxMode`） | 仅 `package.json` | 同形 |
| `dsh-sandbox-policy`（`SandboxPolicyService`、`setSandboxMode`） | 仅 `package.json` | 同形（`index.ts:110,178`、`session-mode.ts:54`） |
| `dsh-permission-presets`（`PermissionPresetService.set`） | 仅 `package.json` | 同形（`index.ts:180,398`） |
| `dsh-commands`（`commands.register`） | 仅 `package.json` | 同形（`index.ts:285`、`types.ts:34`） |
| `dsh-settings`（`ctx.settings.configure`） | 仅 `package.json` | 同形（`index.ts:266`） |
| `dsh-tools`（`tools/pre-execute`、`PreToolDecision`） | 仅 `package.json` | 同形（`core/tools/src/index.ts:154`） |
| `dsh-api-remotes`（`ctx.remote.commands.execute`） | 仅 `package.json` | 同形 |
| `dsh-client-locale`（`locale.register`/`bind`） | 仅 `package.json` | 同形（`client/index.ts:399,455`） |
| `dsh-client-ui-slots`（`slots.register`、`PropsRuntime`、`InjectFace`） | 仅 `package.json` | 同形（`index.ts:255,588,1207`） |
| `dsh-client-ui-renderer`（`ctx.slots` 类型增广） | 仅 `package.json` | 同形 |
| `dsh-client-ui-session`（`SessionId`） | 仅 `package.json` | 同形 |
| `dsh-client-ui-settings`（`settings.section`、`ConfigForm`） | 仅 `package.json` | 同形（`contract/slots.ts:57`、`config-form-types.ts:36`） |
| `dsh-client-ui-conversation`（`conversation.input.left`） | **12 个源文件变** | 全是 header/view/pins/reasoning/composer-submission 等插件未使用区域；slot 声明 `contract/slots.ts:276`、渲染 `InputBar.tsx:469`、注册 `apply.ts:455` 两版逐字一致 |
| `dsh-client-ui-primitives`（`Menu`、chevron 图标） | **4 个源文件变** | `Menu` 只新增可选 `current`/`minWidthFromAnchor`；`IconChevronDownOutlineRegular` 仍在；`Tooltip` 重构（插件未用）——向后兼容 |
| `shell`（cast `ctx.get('shell')`） | 仅 `package.json` | `sandboxMode` getter 同形（`shell/src/index.ts:74`） |
| `llm`（cast `SmartLlmService` → `stream`） | 仅 `package.json` | `stream` 同形（`llm/src/index.ts:191`） |
| `agent-default-model`（`currentSelection`） | 仅 `package.json` | 同形（`index.ts:67`） |

### 3.3 严格类型调用点（rc.5 逐个确认同形）

`setSandboxMode(session, mode)`、`SandboxPolicyService.defaultMode/overrideOf`、`PermissionPresetService.set`、`ctx.settings.configure({ auto }, fiber)`、`commands.register({ name, description, input.hint, handler })`、`ctx.remote.commands.execute(sessionId, line, images)`、`ctx.locale.register/bind`、`ctx.configForms.get`、`slots.inject/register`。均与 rc.2 同形；`pnpm typecheck` 面对 rc.5 类型零错误是直接证据。

### 3.4 cast 型 seam（typecheck 抓不到的运行期契约）

| 位置 | cast 形状 | rc.5 证据 | 判定 |
| --- | --- | --- | --- |
| `src/index.ts:275` | `ctx.get('shell') as { sandboxMode?: string }` | `shell/src/index.ts:74` getter 同形；包源码零改动 | ✅ 静态兼容，**须 L5 实测** |
| `src/index.ts:356` | `ctx.get('llm') as SmartLlmService` | `llm/src/index.ts:191` `stream` 同形；包源码零改动 | ✅ 静态兼容，**须 L5 实测 smart 分类器** |
| `src/index.ts:357` | `ctx.get('agentDefaultModel')` | `index.ts:67` `currentSelection()` 同形 | ✅ 静态兼容，**须 L5 实测** |

### 3.5 客户端两个 slot 的契约（指南 §4.2 核对项）

- `conversation.input.left`：rc.2 ↔ rc.5 的槽位声明（`ui-conversation/src/client/contract/slots.ts:276`）、渲染点（`skeleton/InputBar.tsx:469`）、注册路径（`apply.ts:455`）逐字一致；本插件以 session-scoped 标准 slot 注册，`inject(sessionId)` 形状不变。
- `settings.section`：`ui-settings/src/client/contract/slots.ts:57` 两版一致；`inject().form = ctx.configForms.get(ENTRY_ID)` 仍成立。
- `dsh.client.inject` 列出的 `@deepseek-ai/dsh-api-remotes` / `@deepseek-ai/dsh-client-locale` / `@deepseek-ai/dsh-client-ui-conversation` 三包在 rc.5 均存在且 expose `./client`。

### 3.6 本插件契约面清单（本轮复核对象）

Host（`src/index.ts` 及 `src/*.ts`）：

| 面 | 位置 | rc.5 状态 |
| --- | --- | --- |
| `tools/pre-execute` waterfall | `src/index.ts:385` | 同形（`core/tools/src/index.ts:154`） |
| `PreToolDecision`：`{kind:'ask',reason}` / `{kind:'allow'}` / 透传下游 | `src/index.ts:387-396,419-457` | 同形 |
| `ctx.inject(['settings'])` + `settings.configure({auto:false}, fiber)` | `src/index.ts:239` | 同形（`settings/src/index.ts:266`） |
| `ctx.get('sandboxPolicy')` → `.defaultMode` / `.overrideOf` | `src/index.ts:274,276,414,506` | 同形（`sandbox-policy/src/index.ts:110,178`） |
| `setSandboxMode(session, mode)` | `src/index.ts:479,496` | 同形（`session-mode.ts:54`） |
| `ctx.get('permissionPresets')` → `.set` | `src/index.ts:485-488` | 同形（`permission-presets/src/index.ts:180,398`） |
| `commands.register({name,description,input.hint,handler})` | `src/index.ts:511-528` | 同形（`commands/src/index.ts:285`） |
| `ctx.get('shell')` cast → `.sandboxMode` | `src/index.ts:275` | 同形（`shell/src/index.ts:74`） |
| `ctx.get('llm')` cast → `stream` | `src/index.ts:356` | 同形（`llm/src/index.ts:191`） |
| `ctx.get('agentDefaultModel')` cast → `currentSelection()` | `src/index.ts:357` | 同形（`agent-default-model/src/index.ts:67`） |
| `Session` / `SessionEvent` / `snapshotEvents()` | `src/index.ts:31`、`src/smart-classifier.ts:26` | 同形 |
| 9 个 `Volatile` Config 字段 `.get()` | `src/index.ts:245-263` | 同形 |

Client（`src/client/index.ts` 及组件）：

| 面 | 位置 | rc.5 状态 |
| --- | --- | --- |
| `conversation.input.left`（list/session，id `approval-mode`，order 10） | `src/client/index.ts:89-138` | 契约逐字一致 |
| `settings.section`（list/root，id `approval-mode`，order 1100，label thunk） | `src/client/index.ts:147-159` | 契约逐字一致 |
| `ctx.locale.register` ×2 + `bind`（自有 NS） | `src/client/index.ts:80-86` | 同形（`locale/client/index.ts:399,455`） |
| `ctx.remote.commands.execute(sessionId, line, images)` | `src/client/index.ts:99,124` | 同形 |
| `ctx.configForms.get<Config>(ENTRY_ID)` 与 `ConfigForm` 的 set/unset/subscribe | `src/client/index.ts:157`、`ApprovalModeSettings.tsx:217-245` | 同形（`config-form-types.ts:36-80`） |
| `Menu/Input/Switch/IconChevronDownOutlineRegular` | Chip/Settings 组件 | 同形（`ui-primitives` 仅加可选 props） |
| bundle 外壳 `window.__ModuleLoader__.load({id,factory})`，运行时 require 仅 `react`/`react/jsx-runtime`/`ui-primitives` | `tsdown.config.ts:95-97`、`lib/client.js:7-9` | 同形（rc.5 loader/manifest 契约未变） |

---

## 四、兼容门机制与失败模式

判定代码 `packages/boot/app-boot/src/plugin-compatibility.ts`（rc.2 ↔ rc.5 逐字节相同，`sha256` 前 16 位 `3aaddccc788734db`）。本包**无 `engines.dsh`**，因此逐个校验 `peerDependencies` 中名为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的项（`cordis`/`schemastery`/第三方包跳过），判定式 `semver.satisfies(runtime, range, { includePrerelease: true })`。

**门谓词实算（15 条 peer = `^0.2.1-rc.2`）**：

| 运行时 | 0.2.1-rc.1 | 0.2.1-rc.2 | 0.2.1-rc.3 | 0.2.1-rc.4 | **0.2.1-rc.5** | 0.2.1 | 0.2.2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 结果 | ❌ | ✅ | ✅ | ✅ | ✅（15/15） | ✅ | ✅ |

**失败模式**：本包是 bundle（`dsh.bundle.patch`），兼容门拒绝时不是禁用某一行，而是**整包跳过** —— 启动器打印 `dsh: skipping profile bundle "dsh-user-approval-mode"`，chip 与设置页整体不加载。普通 row 形态才是 `disabling profile plugin row`。

**抬线后果**：devDeps 抬到 rc.5 只影响本仓开发/类型检查；peer 未动 ⇒ **运行中的 rc.2 宿主继续接受 v0.10.0**（与 v0.9.0 的「必须同批次」不同）。rc.1 与 0.2.0-rc.* 仍被拒收。

---

## 五、L1 静态验证记录

环境：Node v24.18.0，pnpm 11.28.5，worktree `.worktrees/dsh-0.2.1-rc.5`，store 复用主 checkout `.pnpm-store`。

| 步骤 | 结果 |
| --- | --- |
| `pnpm install --store-dir <main>/.pnpm-store --config.confirmModulesPurge=false` | **exit 0**；`✓ Lockfile passes supply-chain policies (192 entries)`；新增 112 个包；15/15 devDeps = `0.2.1-rc.5`；`cordis 4.0.5`、`schemastery 3.18.5` |
| 锁文件核对 | `0.2.1-rc.5` × **271**；`0.2.1-rc.2` × **0**；`specifier: ^0.2.1-rc.5` × **15**；diff 387 增 / 387 删，全部为 `@deepseek-ai/dsh-*` 版本与 integrity |
| `pnpm typecheck`（`tsc -p tsconfig.test.json`） | **exit 0，零错误** ⇒ 印证「src 零改动」 |
| `pnpm test` | **exit 0，115 passed / 0 failed** |
| `pnpm build`（`tsc && tsdown`） | exit 0，`lib/client.js` 42.76 kB（与已提交产物同尺寸） |
| 门谓词 | rc.2–rc.5 / 0.2.1 / 0.2.2 全通过（§4）；devDeps@rc.5 同样通过 |
| §6.1 grep | `assertNever` 0；`send_button_click` 0；`settingsScope` / `settings.plugin.item` 0；`dsh-invariants` 仅出现在 `pnpm-lock.yaml` 传递依赖（`src/`、manifest 0 处） |
| `git diff --exit-code lib/` | 非空 → **已归因并回滚**（§2.2 / §5.1） |

### 5.1 产物差异归因（逐 hunk）

| 差异 | 数量 | 归因 |
| --- | --- | --- |
| `//#region \0dsh-css:<路径>` 注释 | 2 处 | worktree 绝对路径 ≠ 主 checkout 路径 |
| CSS Modules 类名前缀 | 30 行（两边各 30） | lightningcss 按 `filename` 派生 `[hash]`，且 1.33.0 与产出已提交产物时的版本字形不同 |
| CSS 规则文本 / JS 结构 / 组件逻辑 | **0 处** | 逐字节一致 |

⇒ 与上一轮（`docs/2026-10-18-dsh-v0-2-1-rc-2-compatibility-audit.md` §5.1）同一类构建噪声，与依赖抬版无关；`src/` 零改动 ⇒ 按仓规不回滚以外的动作，`lib/` 保持已提交版本。

**独立复核（不依赖构建流程）**：`lib/client.js.map` 的 `sourcesContent` 与 `src/client/**` 五个文件逐字节一致；host 侧用已安装的 `tsc` 在内存中 transpile 后与 `lib/*.js` 逐文件对比，除 `//# sourceMappingURL=` 行外全部一致；`git log` 显示 `src/` 最后改动为 `2f014d9`，`lib/` 最后改动为 `af64128`（晚于 src）。⇒ 已提交 `lib/` 就是当前 `src/` 的产物，本轮无需（也不应）重建。

---

## 六、依赖树残留（已决策接受，与上一轮相同）

`@rh854lkjd/dsh-tool-list-dir@0.3.3`（本仓 `dependencies` 声明 `>=0.2.7`，`src/**` 无任何 import）会由 pnpm 自动安装 peer，在 dev 树中拖入：

| 包 | 版本 | 来源 |
| --- | --- | --- |
| `@deepseek-ai/dsh-fs` | `0.2.0-rc.2` | `dsh-tool-list-dir` 的 peer |
| `@deepseek-ai/dsh-invariants` | `0.2.0-rc.2` | `dsh-fs@0.2.0-rc.2` 的 peer（上游 rc.5 已删除该包，npm 上只剩旧版） |

因此 `pnpm peers check` 报 4 条 unmet peer（`dsh-working-directory@0.2.1-rc.5` 等想要 `dsh-fs@0.2.1-rc.5`，实际装的是 `0.2.0-rc.2`），`pnpm-lock.yaml` 里仍有 9 处 `dsh-invariants` 字样。**不影响本插件**：

- 兼容门只读本插件自己的 `@deepseek-ai/dsh-*` peers，与传递 cohort 无关；
- 宿主运行时用 profile 的 `node_modules`，不是本仓的；
- 本插件源码从不 import `dsh-tool-list-dir`（历史声明，属上次审计 §6 记录的可选清理项）。

**消除方式（未在本轮做）**：删掉冗余的 `@rh854lkjd/dsh-tool-list-dir` 依赖，或等该包发一版 peer 对齐 0.2.1 线的版本（registry 已有 `0.4.0`，本仓锁仍为 `0.3.3`）。

---

## 七、实机验证清单（L2 / L4 / L5 / L6，本轮未执行）

宿主路线（与上一轮一致，待宿主升级轮执行）：优先用 rc.5 源码树/rc.5 全局包，**不要在运行中的 dsh 会话里升级全局包**（指南 §2 Step 1）。

| 层 | 做什么 | 通过标准 |
| --- | --- | --- |
| L2 启用解析 | `dsh --profile web --dump-config` | 组合里有 `dsh-user-approval-mode`；**无** `skipping profile bundle`、**无** `disabling profile plugin row` |
| L2 证伪 | 临时把一条 peer 改成精确钉 `0.2.1-rc.1` 重启 | `skipping profile bundle` 信号**必须**出现，再改回（防止「没报错=通过」） |
| L4 冷启动 | 受管后台任务启动 rc.5 宿主（显式空闲端口） | 回报确切 URL；无 `Cannot find module`；服务正常 ready |
| L5 行为 | ①chip 渲染 ②`/approval-mode smart` 切换 ③设置页渲染 8 字段 ④字段写入落到 profile `cordis.patch.yml` user 层并即时生效 ⑤smart 模式跑一条 bash | ⑤须走通 `ctx.get('llm').stream` 与 `session.snapshotEvents()` 两条 **cast seam**（typecheck 抓不到），日志出现 `[dsh-user-approval[smart]] decision=…` |
| L6 Web 插件 | 浏览器控制台 + 插件管理页 | bundle 注册并 mount；`style[data-plugin="dsh-user-approval-mode"]` 存在；**无** `slot entry crashed`；入口未被 rc.5 的 More 折叠影响 |

> rc.5 专项语义项（§3.4 指南）与本插件**无关**：不创建会话（`startSession`）、不渲染 reasoning、不注册 view/panel actions。若插件日后接入其中之一，需重查对应条目。
>
> **测试覆盖缺口（本轮只读审计确认）**：`test/**` 没有任何 client 装配测试——slot 注册、`locale.register`、`configForms`、`remote.commands` 全链路只能靠 L6 实机覆盖；`tools/pre-execute` 闸逻辑与工具族默认值有 115 个测试。工具参数 `command` / `sandbox_permissions` / `justification` 从 `unknown` 读取、无类型护栏，属 L5 重点。

---

## 八、环境发现

1. **rc.5 源码快照 ≠ git tag 树（但源码可用）**。`deepseek-harness-dsh-v0.2.1-rc.5/` 相对 tag `b830ec95` 少 **13 个普通文件 + 1 个符号链接**（`.claude/skills`）：`CLAUDE.md`（根/`packages`/`vendor`/`.agents`）、`.agents/skills/agent-experience/SKILL.md`、`snapshots/**/system-prompt.expected.md` 与 `tool-schemas.expected.json`、`apps/cli/tests/profiles/acp/cordis.yml`、`snapshots/session/agent-instructions/workspace/**/AGENTS.md`；**无多出文件**。抽查的关键源码（`plugin-compatibility.ts`、`ui-conversation/contract/slots.ts`、`ui-primitives/Menu.tsx`、`ui-settings/contract/slots.ts`、`core/tools/src/index.ts`）与 tag blob 逐字节一致。⇒ 需要「某 rc.5 新文件是否存在」时用 **git tag 树**，不要用快照的文件缺失下结论；本审计的差异结论全部已在 tag 上复核。
2. **pnpm 11.28.5 仍执行发布隔离（`minimumReleaseAge`）**：安装日志有 `✓ Lockfile passes supply-chain policies (192 entries)`；rc.5 发布于 `2026-10-29T13:46Z`，距本次安装已 3 天，超出默认 1440 分钟窗口，且 `pnpm-workspace.yaml` 仍按名豁免整个 `@deepseek-ai/dsh-*` scope——安装未再出现上一轮的「静默回退到旧 rc」。
3. **`@rh854lkjd/dsh-tool-list-dir` 锁在 0.3.3**（registry 已有 0.4.0）：本轮未升级它（范围 `>=0.2.7` 未动，锁文件保持既有解析），因此 §6 的 cohort 与上一轮完全一致，未引入新残留。
4. **lightningcss 1.33.0** 的 CSS Modules hash 算法与生成已提交产物时的 1.27 线不同（前缀带 `_`），是 §5.1 差异的一半来源。

---

## 九、非目标 / 未验证 / 遗留

**非目标（明确未做）**

- 未改 `src/**`、`test/**`、`cordis.patch.yml`、`tsdown.config.ts`、`tsconfig*.json`、`exports`、`files`、`scripts`、`lib/**`。
- 未引入 `engines.dsh`；未改 15 条 peer 范围；未按指南可选建议降到 `^0.2.1-rc.1`。
- 未删除/升级冗余依赖 `@rh854lkjd/dsh-tool-list-dir`；未清理 `pnpm-workspace.yaml` 的历史惰性条目。
- 未发布、未打 tag、未合并 `main`；未重启或替换用户现有宿主；未升级宿主到 rc.5（L2/L4/L5/L6 全部推迟）。
- 舰队其余 7 仓与已弃用的 4 个插件未动。

**遗留项**

1. 陈旧 dev 依赖 cohort（§6）：`dsh-fs@0.2.0-rc.2` / `dsh-invariants@0.2.0-rc.2`。建议下一次清理轮删掉未使用的 `dsh-tool-list-dir` 声明。
2. 实机验证（L2/L4/L5/L6）待宿主升级轮执行（§7）。
3. 工具名默认清单的历史缺口仍在（`workflow`/`create_goal`/`job_kill`/`team_task_*`/`web_search`/`web_fetch`/`list_subagent_models` 未进 `readOnlyTools`/`autoAllowTools`）——与 rc.5 走廊无关，未纳入本轮。
4. `tsdown.config.ts:11` / `scripts/build-client.mjs:15` 仍列废弃的 `@deepseek-ai/dsh-client-runtime` external（实际产物 `lib/client.js:7-9` 只 require `react` / `react/jsx-runtime` / `ui-primitives`，该条目从未生效）——历史遗留，未动。另：`src/client/locales.ts:4-5` 注释仍写旧命名空间名（`approval` / `approval-page`），实际 NS 为 `dsh-user-approval-mode*`，属陈旧注释。
5. `Session.snapshotEvents()` 的 `@deprecated` 用法未迁移（0.2.0 走廊已存在，行为未变）。

---

## 十、一句话总结

**本插件在 rc.2 → rc.5 走廊上再次「零源码改动」：指南 §3 的全部契约/埋点/语义变化逐条未命中，host 侧 12 个消费包只改版本号，client 侧只消费 `conversation.input.left` 与 `settings.section` 两个逐字未变的 slot；真实改动只有「devDependencies 抬到 rc.5 + 插件发版 0.10.0 + 文档」，peer 范围继续留在 `^0.2.1-rc.2` 以保持一份产物可装 rc.2–rc.5+，`lib/` 因无 `src/` 改动而不重建。**

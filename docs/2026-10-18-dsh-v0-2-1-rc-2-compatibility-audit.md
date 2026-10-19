# dsh-user-approval-mode v0.9.0 升 DSH v0.2.1-rc.2 兼容性审计

**日期**: 2026-10-18
**审计基线**: 本仓 `main` = `af64128`（工作区 clean，`pnpm-lock.yaml` sha256 `01a8eb73…2b5c2ec`）；上游对照 `deepseek-harness` = `dsh-v0.2.0-rc.2` ↔ `deepseek-harness-dsh-v0.2.1-rc.2`（`@deepseek-ai/dsh-root@0.2.1-rc.2`）
**审计目标**: `dsh-user-approval-mode` 从 `^0.2.0-rc.1` 抬到 DSH `0.2.1-rc.2` 依赖线
**审计依据**: `deepseek-harness/DSH-0.2.1-rc.2-插件升级指南.md`；`.dsh-upgrade-notes/v021rc2/{surface,symbol,manifest,fleet}-diff.txt` + `cmp-*.py`（机器 diff）；本仓 `llm-workflows/2026-09-09-dsh-upgrade-audit-workflow.md`（10 条高风险 surface + cast 静默失败清单）
**审计范围**: 仅本插件（单仓）；舰队其余 7 仓、宿主 checkout 的升级本身不在本次范围
**审计结论**: ✅ **`src/**` / `test/**` / `cordis.patch.yml` / `lib/**` 零改动**；改动仅限依赖范围、`pnpm-workspace.yaml`、版本号与文档
**本轮交付状态**: **L1（依赖解析）与静态验证（typecheck / test / build）已实测通过**；**L2 / L4 / L5 / L6 实机验证本轮未执行** —— 经用户决定留到宿主升级那一轮，可执行清单见 §7。凡本文档中未标注「已实测」的实机项，一律视为未验证。

---

## 一、本地基线状态

| 项目 | 值 |
| --- | --- |
| 本仓改动前 HEAD / 分支 | `af64128` / `main`（clean） |
| 本轮工作分支 | `feature/dsh-0.2.1-rc.2-upgrade`，worktree `.worktrees/dsh-0.2.1-rc.2`（`.git/info/exclude` 本地排除，`main` 零 diff） |
| 插件版本（改动前 → 后） | `0.8.0` → `0.9.0` |
| peer `@deepseek-ai/dsh-*` | 15 条（`package.json:34-48`），改动前全 `^0.2.0-rc.1` |
| dev `@deepseek-ai/dsh-*` | 15 条（`package.json:54-68`），同上 |
| 底座 | `@deepseek-ai/cordis >=4.0.4` → `>=4.0.5`；`@deepseek-ai/schemastery >=3.18.4` → `>=3.18.5` |
| 不动项 | `react ^18.2.0`、`zod ^4.4.3`、`@rh854lkjd/dsh-tool-list-dir >=0.2.7`、`exports`、`files`、`scripts` |
| 形态 | `dsh.bundle.patch` = `./cordis.patch.yml` ⇒ **bundle 包** |
| 包管理器 | pnpm 11.7.0（Node v24.18.0），`lockfileVersion: '9.0'`，`autoInstallPeers: true` |
| 运行中宿主（本轮全程未重启） | `dsh --version` = `0.2.0-rc.2` |

---

## 二、结论与改动

1. `package.json`：30 处 `"^0.2.0-rc.1"` → `"^0.2.1-rc.2"`（15 peer + 15 dev）；4 处底座 `>=4.0.4`→`>=4.0.5` / `>=3.18.4`→`>=3.18.5`；`version` → `0.9.0`。
2. `pnpm-lock.yaml`：重解到 `0.2.1-rc.2` 家族。`specifier: ^0.2.1-rc.2` 共 **15 条**（锁文件只登记 `dependencies`/`devDependencies`，peer 侧以 `package.json` 复核）；`0.2.1-rc.1` 出现 **0 次**。
3. `pnpm-workspace.yaml`：**显式写出 `minimumReleaseAge: 1440`，新增 `'@deepseek-ai/dsh-*'` 按名豁免，删除失效的 `- '@deepseek-ai/dsh-invariants@0.1.2-rc.1'`**（理由见 §2.1）。
4. `CHANGELOG.md` / `README.md` / `README.zh.md` / `CONTEXT.md` 同步，新增本审计文档。
5. **无源码改动**：逐包对照见第三节；`pnpm typecheck` 面对 0.2.1-rc.2 类型 **零错误**，直接印证这一点。

### 2.1 ⚠️ 本轮最大的坑：pnpm 11 的发布隔离窗口（而非范围写法）

指南 Step 2.1 推荐 `^0.2.1-rc.1`，理由是「同一条范围同时覆盖 rc.1 与 rc.2 运行时」。该理由对**兼容门**成立（门用 `semver.satisfies(runtime, range, { includePrerelease: true })`），但**不足以让 pnpm 装到 rc.2**。实测与定位过程：

| # | 观测 | 结论 |
| --- | --- | --- |
| 1 | `pnpm install` with `^0.2.1-rc.1` → 15 个包全部装成 **`0.2.1-rc.1`** | 与预期不符 |
| 2 | 换**全新空 store** 复现 → 仍全部 `0.2.1-rc.1` | 排除 pnpm 元数据缓存 |
| 3 | `pnpm view @deepseek-ai/dsh-tools@'^0.2.1-rc.1' version` → `0.2.1-rc.2` | 范围本身**能**匹配 rc.2 |
| 4 | `pnpm view … time` → rc.1 发布于 `2026-10-17T03:03Z`，rc.2 发布于 `2026-10-17T08:18Z` | 两者相差约 5 小时 |
| 5 | 把范围改成 `^0.2.1-rc.2` 后首次安装成功，且 pnpm **自己**往 `minimumReleaseAgeExclude` 写了 39 条 `name@version` 条目 | 触发了供应链策略 |
| 6 | 删掉那 39 条 + 删锁重装 → **exit 1**：`… was published at … within the minimumReleaseAge cutoff (2026-10-17T07:29:38Z)` | **真因锁定** |

**根因**：pnpm 11 内置 **`minimumReleaseAge` 隔离窗口（默认 1440 分钟 = 1 天）**，拒绝解析发布时间落在窗口内的版本。rc.2 发布仅数小时，落在窗口内 ⇒ 解析器**回退到窗口之外的 rc.1**。这解释了 §1 的全部现象：`ipnpm view`（不做策略校验）报 rc.2，`pnpm install`（做策略校验）只能取 rc.1；对非 prerelease 范围（`>=0.2.7` → 0.3.3、`^4.4.3` → 4.6.7）无影响，因为那些版本的发布时间早已出窗。

> 记录一次错误假设以免重犯：最初把现象归因为「pnpm 对 prerelease 范围取最低匹配」，第 6 步否掉了该假设 —— prerelease 语义与此无关，**是发布时间窗口**。

**两条修正**：

1. **`minimumReleaseAgeExclude` 的匹配规则是包名/glob，不是 `name@version`。** 因此 39 条 `@deepseek-ai/dsh-xxx@0.2.1-rc.2` 形式的豁免**全部无效**（第 6 步已实测：加着它们仍然被拒）。这同时解释了本仓 `pnpm-workspace.yaml` 里 0.1.2/0.1.5 时代的历史条目为何一直是惰性的 —— **格式从来就没生效过**。
2. 本仓真正需要的是**按名豁免整个 DSH scope**：`- '@deepseek-ai/dsh-*'`。因为本插件跟踪的就是 DSH 的 rc 线，「发布后几天内就要消费」是常态，逐个版本打补丁既不可持续也不可靠。
3. 窗口改为**显式写出** `minimumReleaseAge: 1440`（数值等于 pnpm 11 的默认值，行为不变），不再依赖隐式默认。

**验证**：清空 `node_modules` + 删除锁文件后全新安装 —— `pnpm install` exit 0，`✓ Lockfile passes supply-chain policies (192 entries)`，锁文件 `0.2.1-rc.2` 出现 **271** 次、`0.2.1-rc.1` **0** 次。

### 2.2 范围为什么仍写 `^0.2.1-rc.2`

豁免生效后 `^0.2.1-rc.1` 很可能也能解到 rc.2（**未复测**），但本轮按用户决定采用 `^0.2.1-rc.2`，理由是它把范围钉在**插件实际验证过的那条线**上，不再依赖解析器/策略窗口的行为。代价是指南标明的唯一缺点：`0.2.1-rc.1` 宿主会被拒收，插件与宿主必须同批次升级。范围语义：`^0.2.1-rc.2` ⇒ `>=0.2.1-rc.2 <0.3.0-0`，接纳 `0.2.1-rc.2` 及其后的 `0.2.1` / `0.2.x`。

---

## 三、上游逐包对照

证据来源：`.dsh-upgrade-notes/v021rc2/surface-diff.txt`（exports-map + 逐文件 export 行）与 `symbol-diff.txt`（导出符号增删/签名变化），并由 `deepseek-harness-dsh-v0.2.1-rc.2` 源码逐点复核。

### 3.1 指南 §3 必修清单：逐条判定

| 指南条目 | 判定 | 证据 |
| --- | --- | --- |
| §3.1.1 版本范围硬门 | **命中** → 已在 §2 处理 | — |
| §3.1.2 子路径插件显示元数据 | 未命中 | 非子路径插件；无 `locale/*.json` 导出 |
| §3.1.3 删除的包与 `./invariant` | **src 未命中**；`pnpm-workspace.yaml` 命中 1 行 | `src/` 零 `invariant` 引用；消费包只是 exports-map 少了 `./invariant`（均未引用） |
| §3.1.4 可选能力不再随 CLI 预装 | 未命中 | `cordis.patch.yml` 已用 `insert` 整行插入 |
| §3.2 组合配置 26 条 | 全未命中 | `cordis.patch.yml` 无 `mode: both` / `backgroundMode` / `enableRunInBackground` / `run_in_background` / `toolFilter` / `persona:` / `dshHome` / `webRuntime` / `nodeExecutable` / `bootstrapPath` / `models:` / `{{cwd}}` |
| §3.3 `dsh-tools` | 未命中 | 只走 `ctx.on('tools/pre-execute')` + `PreToolDecision`；rc.2 的 `ask` 分支仍为 `{ kind:'ask'; reason? }`，仅**新增可选** `displayReason`（`core/tools/src/index.ts:608-612`）。不调 `presentAs('both')` / `createRunCodeTool` / `renderToolsSdk` |
| §3.3 `dsh-session` 新事件 | 未命中 | 不穷举事件类型；`SESSION_FORMAT_VERSION` 仍 4 |
| §3.3 `dsh-web` / `dsh-web-search-deepseek` | 未命中 | 不注册 web 提供方，不读 `ctx.web` |
| §3.3 `dsh-jobs` / job id | 未命中 | `job_output` / `job_list` 只是配置里的工具名字符串，不解析 id |
| §3.3 `dsh-tool-subagent` / `dsh-tool-fs` / `agent-preset-registry` / `agent-instructions` | 未命中 | 均未 import |
| §3.3 `dsh-llm` | 结构兼容，**须实测** | `LlmCallConfig` 拆分了 `LlmCallControls`，但 `GenerateOptions`（`llm/llm/src/types.ts:529`）字段 `provider` / `model` / `messages` / `system?` / `signal?` / `sessionId?` 全在 |
| §3.4 `ui-primitives` | 未命中 | 只用 `Menu` / `Input` / `Switch` / `IconChevronDownOutlineRegular`，四者在 rc.2 全导出；被删的是 `projectUserText` / `UserTextReferences` |
| §3.4 `ui-conversation` | 未命中 | 只用 `conversation.input.left`（rc.2 `client/contract/slots.ts:276` 仍是 session-scoped list 槽位）；被删的 `RenderMessageImages` / `claim-decor.ts` / `ArbitrateKey` 等未用 |
| §3.4 `ui-slots` | 兼容 | `PropsRuntime`(`index.ts:255`) / `InjectFace`(`:588`) / `LocaleNamespaceMap`(`:39`) 均在；`KeyedStandardSource` 只是**新增可选参数** |
| §3.4 `ui-settings` | 未命中 | `ConfigForm` 仍导出（`config-form-types.ts:36`）；exports 只增 `./locale/*.json` |
| §3.4 `ui-theme` | 未命中 | 完全不消费 theme |
| §3.4 `client-ui-plugin-manager` / `InstallSubject` | 未命中 | 不构造插件管理页数据 |
| §3.5 CLI / `dsh plugin` 选项位置 | 未命中 | 无脚本调用 `dsh plugin` |
| §3.2 #26 rc.2 web provider 选择 | 未命中 | 未注册 web 提供方，槽位 `conversation.input.model.label` 未占用 |

### 3.2 严格类型调用点（rc.2 源码逐个确认同形）

| 调用点 | rc.2 证据 |
| --- | --- |
| `setSandboxMode(session, mode)` | `packages/sandbox/sandbox-policy/src/session-mode.ts:53` |
| `SandboxPolicyService.defaultMode` / `.overrideOf(session)` | `sandbox-policy/src/index.ts:122` / `:178` |
| `PermissionPresetService.set(session, name)` | `interaction/permission-presets/src/index.ts:398` |
| `ctx.settings.configure({ auto?: boolean }, fiber)` | `settings/settings/src/index.ts:266` |
| `commands.register({ name, description, input.hint, handler({agent, rawInput}) })` | `interaction/commands/src/index.ts:285`、`:47`、`:69` |
| `ctx.remote.commands.execute(sessionId, line, attachments)` | `api/session-controller/src/client/sessions/remotes.ts:19`（第 4 参 `signal?` 可选；`RemoteResult` 未变） |
| `ctx.locale.register(ns, {zh,en})` / `.bind(ns)` | `client/locale/src/client/index.ts:399` / `:455` |
| `agentDefaultModel.currentSelection()` | `core/agent-default-model/src/index.ts:67`（返回 `{provider, model, reasoningEffort?}`） |

### 3.3 cast 型 seam 核对（本仓方法论 §2.4「silent failure 重灾区」）

本插件共 6 处 `ctx.get(...)` 与 8 处 `as { ... }` 结构化 cast，逐处在 rc.2 源码确认：

| 位置 | cast 形状 | rc.2 证据 | 判定 |
| --- | --- | --- | --- |
| `src/index.ts:275` | `ctx.get('shell') as { sandboxMode?: string }` | `shell/shell/src/index.ts:74` `get sandboxMode(): SandboxMode \| undefined` | ✅ 在 |
| `src/index.ts:356` | `ctx.get('llm') as SmartLlmService` | `llm/llm/src/types.ts:529` `GenerateOptions` 六字段全在 | ✅ 兼容，**typecheck 抓不到，必须 L5 实测** |
| `src/index.ts:357` | `ctx.get('agentDefaultModel')` | `:67` 返回 `{provider, model, reasoningEffort?}` | ✅ 兼容 |
| `src/index.ts:274` | 无 cast（正式类型 `SandboxPolicyService`） | — | ✅ |
| `src/index.ts:485` | 无 cast（正式类型 `PermissionPresetService`） | — | ✅ |
| `src/smart-classifier.ts:552-556` | `session as { snapshotEvents?(): … }` / `session.events` | `core/session/src/index.ts:725` `snapshotEvents(fromSeq = SessionLogOffset(0), toSeqExclusive = this.seq)` — **两参均有默认值**，无参调用仍成立 | ✅ 兼容，**须 L5 实测** |
| `src/smart-classifier.ts:396` | `chunk.reason as { kind: string }` | `llm/llm/src/types.ts:470` `StreamChunk`、`:479` `reason: FinishReason` | ✅ 在 |
| `src/smart-classifier.ts:651` | `exec as { signal?: AbortSignal }` | `core/tools/src/index.ts:352` `readonly signal: AbortSignal`（`ToolExecution extends ToolExecutionInput`，`:394`） | ✅ 在 |
| `src/smart-classifier.ts:153,195,197,203` | 消息/块结构读取 | `RequestMessage` 未在 `symbol-diff` 中变化 | ✅ |

**附带发现（记录，不改）**：`Session.snapshotEvents()` 在 rc.2 已标 `@deprecated`（`core/session/src/index.ts:719`，指向 Agent Note `2026-09-09-deprecate-synchronous-session-event-reads.md`），但该标注**在 `dsh-v0.2.0-rc.2` 树里已存在**（`packages/core/session/src/index.ts:630/643/662`），属上一走廊遗留、非本轮引入；行为未变，故不属本轮改动范围。

---

## 四、兼容门机制与失败模式

判定代码：`packages/boot/app-boot/src/plugin-compatibility.ts`（指南 §1.3 已核实 rc.1 与 rc.2 该文件逐字节相同）。

- `engines.dsh` **优先**；本包未声明该字段，因此逐个校验 `peerDependencies` 中名字为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的项；`@deepseek-ai/cordis` / `@deepseek-ai/schemastery` / `@rh854lkjd/*` 一律跳过。
- 判定式 `semver.satisfies(runtime, range, { includePrerelease: true })`。
- **失败模式是整包跳过，不是禁用某一行**：本包带 `dsh.bundle.patch`，bundle 包兼容失败即 `skippedBundles`，启动器打印 `dsh: skipping profile bundle "dsh-user-approval-mode"`，chip 与设置页整体不加载。（普通 row 形态才是 `disabling profile plugin row`。）

**门谓词静态实测**（运行时 = `0.2.1-rc.2`）：

| 范围 | 通过？ | 备注 |
| --- | --- | --- |
| `^0.2.1-rc.2`（本轮采用） | ✅ | 下限钉在 rc.2；拒收 rc.1 与全部 0.2.0-rc.* |
| `^0.2.1-rc.1` | ✅ | 指南推荐；门能接纳 rc.2，但 pnpm 装包时会受隔离窗口影响（§2.1） |
| `^0.2.0-rc.1`（改动前） | ✅ | 仍被 rc.2 宿主接纳 |
| `0.2.1-rc.1`（精确钉） | ❌ | 从 rc.1 迁 rc.2 最易踩；本包未使用 |
| `0.2.0-rc.2`（精确钉） | ❌ | 本包未使用 |

**抬版的兼容性后果**：`^0.2.1-rc.2` **不含** `0.2.1-rc.1` 与任何 `0.2.0-rc.*` ⇒ 插件发版与宿主升级必须同批次。当前运行中的 3080 宿主（`0.2.0-rc.2`）在重启后会拒收本插件，故本轮改动刻意留在 worktree，主 checkout 的 `main` 不被触碰。

---

## 五、L1 静态验证记录

环境：Node v24.18.0，pnpm 11.7.0，worktree `.worktrees/dsh-0.2.1-rc.2`。

| 步骤 | 结果 |
| --- | --- |
| 全新安装（清空 `node_modules` + 删除锁文件）`pnpm install --store-dir <worktree>/.pnpm-store --config.confirmModulesPurge=false` | **exit 0**；`✓ Lockfile passes supply-chain policies (192 entries)`；15 个 `@deepseek-ai/dsh-*` 全部 `0.2.1-rc.2`；`cordis 4.0.5`；`schemastery 3.18.5` |
| 锁文件核对 | `0.2.1-rc.2` × 271；`specifier: ^0.2.1-rc.2` × 15；`0.2.1-rc.1` × **0** |
| `pnpm typecheck`（`tsc -p tsconfig.test.json`） | **exit 0，零错误** ⇒ 印证「src 零改动」 |
| `pnpm test` | **exit 0，115 passed / 0 failed** |
| `pnpm build`（`tsc && tsdown`） | exit 0，`lib/client.js` 42.76 kB 正常产出 |
| `git diff --exit-code lib/` | 非空 → **已归因并回滚**，见 §5.1 |

### 5.1 产物差异归因（关键：不是本轮依赖引起）

在 worktree 内 `pnpm build` 后 `lib/client.js` 与 `lib/client.ts.map` 出现 30 增 30 删。逐 hunk 核对后归因如下：

1. **构建目录绝对路径进入产物**：产物里存在 `//#region \0dsh-css:<绝对路径>.mjs` 注释，worktree 路径自然与主 checkout 不同。
2. **CSS Modules 类名 hash 随路径变化**：`tsdown.config.ts` 用 `pattern: '[hash]_[local]'`，而 lightningcss 的 `[hash]` 由传入 `filename` 决定。实测同一份 CSS 在两个路径下得到不同前缀（committed `FATkTq_*` / `DxQiRa_*` → worktree `_1ktUXW_*` / `rBAU4G_*`），且 `lightningcss` 由 1.27 线升到 1.33.0 也改变了 hash 字形（新前缀带 `_`）。
3. **差异内容 100% 是 CSS hash 与 region 路径注释**：CSS 规则文本、JS 结构、组件逻辑一字未变；CSS 文本与 JS 类名映射使用**同一个**前缀，构建内部自洽，渲染行为不受影响。

⇒ 结论：差异是构建工具行为（路径相关 hash），**不是依赖抬版引起的语义变化**。`src/` 零改动 ⇒ 按本仓约定（`CONTEXT.md` §Distribution：`src/` 改动才需重建并提交 `lib/`）**`lib/` 保持提交版本不变**，已在 worktree 执行 `git checkout -- lib/` 回滚。

**若日后需要在主 checkout（规范路径）复核产物可复现性**：在 `main` 上重跑 `pnpm build` 并 `git diff --exit-code lib/`，预期为空。本轮未执行（会把新依赖装进主 checkout）。

---

## 六、依赖树残留（已决策接受）

`@rh854lkjd/dsh-tool-list-dir@0.3.3`（本仓 `dependencies` 声明 `>=0.2.7`，锁文件重解后取到 0.3.3）会由 pnpm 自动安装其 peer，因而在树内拖入一条**陈旧 cohort**：

| 包 | 版本 | 来源 |
| --- | --- | --- |
| `@deepseek-ai/dsh-fs` | `0.2.0-rc.2` | `dsh-tool-list-dir` 的 peer |
| `@deepseek-ai/dsh-invariants` | `0.2.0-rc.2` | `dsh-fs@0.2.0-rc.2` 的 peer |

因此 `pnpm-lock.yaml` 里仍有 9 处 `dsh-invariants` 字样、13 处 `0.2.0-rc.2`，`pnpm peers check` 报 `unmet peer`（`dsh-fs@0.2.0-rc.2` 想要 `dsh-brand` / `dsh-llm` / `dsh-sandbox` 的 0.2.0-rc.2）。

**为何不影响本插件**：

- 上游在 0.2.1 已删除 `dsh-invariants` 包，npm 上仍留着 0.2.0-rc.2，pnpm 只能解析到这个旧版本；
- 指南 §3.1.3 明确：锁文件里的 `dsh-invariants` 是**宿主安装树的传递依赖记录，不是命中项**；要查的是自己的 `cordis*.yml` / `presets/` / `src/` —— 这三处均已确认零引用；
- 兼容门只读**本插件自己**的 `@deepseek-ai/dsh-*` peers，与传递 cohort 无关；
- 宿主运行时用的是 profile 的 `node_modules`，不是本仓的，因此这条 cohort 也不参与实际加载。

**顺带观察**：`@rh854lkjd/dsh-tool-list-dir` 在 `src/**` 中**没有任何 import**（已 grep 确认）。它同时出现在 `web` profile 的 `dsh.profile.bundles` 与 `dependencies` 里，本仓这条声明是冗余的；**删掉它即可让这条陈旧 cohort 消失**。本轮未动（超出兼容性升级范围），记为可选清理项。

由 0.2.7 → 0.3.3 的版本变化也值得记录：`web` profile 本身依赖 `^0.3.3`，所以取 0.3.3 与宿主一致，比上一走廊的 0.2.7 更对齐。

---

## 七、实机验证清单（L2 / L4 / L5 / L6）

宿主路线（经用户确认）：不装全局 npm 包，改用仓内已存在的 0.2.1-rc.2 源码树 `/home/hive/projects/dsh-plugin_dev/deepseek-harness-dsh-v0.2.1-rc.2`（`@deepseek-ai/dsh-root@0.2.1-rc.2`，脚本 `dsh: node --import tsx/esm apps/cli/src/bin.ts`）。该 checkout 当前**没有 `node_modules`**，首次需整仓 `pnpm install`。

前置：备份 `~/.dsh/profiles/web/{package.json,cordis.patch.yml}`；把 profile 的 `dsh-user-approval-mode` 依赖临时改指 worktree（否则验的是主 checkout 旧产物）：

```sh
cd /home/hive/projects/dsh-plugin_dev/deepseek-harness-dsh-v0.2.1-rc.2
pnpm install
pnpm dsh plugin --profile web add link:/home/hive/projects/dsh-plugin_dev/dsh-user-approval/.worktrees/dsh-0.2.1-rc.2
pnpm dsh --profile web --dump-config
```

| 层 | 做什么 | 通过标准 |
| --- | --- | --- |
| L2 启用解析 | `--dump-config` | 组合里有 `dsh-user-approval-mode`；**无** `skipping profile bundle`、**无** `disabling profile plugin row` |
| L2 证伪 | 临时把一条 peer 改成精确钉 `0.2.1-rc.1`，重启 | `skipping profile bundle` 信号**必须**出现，再改回。防止「没看到报错」被当成「通过」 |
| L4 冷启动 | 受管后台任务启动 0.2.1-rc.2 宿主（显式空闲端口） | 记录并回报**确切 URL**；无 `Cannot find module`；服务不长期 PENDING |
| L5 行为 | ①chip 渲染 ②`/approval-mode smart` 切换 ③设置页渲染 8 字段 ④字段写入落到 profile `cordis.patch.yml` 用户层并即时生效 ⑤smart 模式跑一条 bash | 全部通过；⑤须走通 `ctx.llm.stream` 与 `session.snapshotEvents()` 两条 **cast seam**（typecheck 抓不到），日志出现 `[dsh-user-approval[smart]] decision=…` |
| L6 Web 插件 | 浏览器控制台 + 插件管理页 | bundle 注册并 mount；`style[data-plugin="dsh-user-approval-mode"]` 存在；**无 React `#130`** |

**收尾**：把 profile 依赖从备份恢复为 `link:/home/hive/projects/dsh-plugin_dev/dsh-user-approval/`；关闭验证用的后台宿主任务。

---

## 八、环境发现（非发布内容，供后续排查）

1. **pnpm 11 的 `minimumReleaseAge` 默认窗口会静默改写解析结果**（本轮最重要的发现，详见 §2.1）：默认 1440 分钟；窗口内的版本**不可解析**，解析器静默回退到上一个合格版本。配置项 `pnpm config get minimumReleaseAge` 在只读默认值下返回 `undefined`，**看不出策略正在生效**。规避方式：`minimumReleaseAgeExclude` 里按**包名/glob** 豁免（不是 `name@version`）。
2. **`minimumReleaseAgeExclude` 只认包名/glob**：本仓 0.1.2 / 0.1.5 时代的 39 条 `pkg@version` 条目**从未生效**，属格式错误的历史残留；本轮已在文件里注明，并保留它们仅为可读性。
3. **`.npmrc` 的 `store-dir` 在 pnpm 11 已失效**：仍继承上一轮的结论，本轮继续用 CLI 显式 `--store-dir`。
4. **无 TTY 时 pnpm 需 `--config.confirmModulesPurge=false`**，否则 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`。
5. **registry 可达**（`pnpm install` 正常下载）；但 `npm view` 在本机查 `0.2.1-rc.2` 时报错，`pnpm view` 正常 —— 排查版本可用性时优先用 `pnpm view`。
6. **git worktree 内没有 `tutorial/` / `local-docs/` / `ref_codes/`**（均被 `.gitignore` 忽略）。教程清理只能在主 checkout 做；worktree 的自查 grep 天然不含这些本地目录。

---

## 九、非目标 / 未验证 / 遗留

**非目标（明确未做）**

- 未改 `src/**`、`test/**`、`cordis.patch.yml`、`tsdown.config.ts`、`tsconfig*.json`、`exports`、`files`、`scripts`。
- 未引入 `engines.dsh`（本仓策略：有 peer 就靠 peer 门；引入会让 peer 全部退出判定）。
- 未清理 `minimumReleaseAgeExclude` 里的历史 `pkg@version` 条目（惰性、无害；本轮只删掉已不存在的 `dsh-invariants@0.1.2-rc.1` 并在文件里注明其无效）。
- 未发布、未打 tag、未合并 `main`；未重启或替换用户现有 3080 宿主。
- 舰队其余 7 仓未动。

**遗留项**

1. `dsh-fs@0.2.0-rc.2` / `dsh-invariants@0.2.0-rc.2` 陈旧 cohort 仍在（§6）。消除方式：删掉冗余的 `@rh854lkjd/dsh-tool-list-dir` 声明，或等上游发一版 peer 对齐 0.2.1 的 list-dir。
2. **豁免生效后 `^0.2.1-rc.1` 是否能解到 rc.2 未复测**（§2.2）。若确认可以，可考虑放宽回指南推荐范围以接纳 `0.2.1-rc.1` 宿主。
3. `Session.snapshotEvents()` 的 `@deprecated` 用法未迁移（0.2.0 走廊已存在，行为未变）。上游 Agent Note 建议新调用改用异步读取；本插件属「既有逻辑」，待上游给出替代 API 再统一迁移。
4. **工具名默认清单未刷新**：`autoAllowTools` / `readOnlyTools` 缺 Agent-Teams 时代的 `workflow`、`create_goal`、`job_kill`、`team_task_create`、`team_task_get`、`web_search`、`web_fetch`、`list_subagent_models`（会落到 `other` → 按 `unclassified` 处理，`request`/`auto-edit`/`smart` 下会弹窗）。这是**既有缺口**，与 0.2.1 走廊无关，未纳入本轮。
5. `tsdown.config.ts:11` 与 `scripts/build-client.mjs:15` 仍列着废弃的 `@deepseek-ai/dsh-client-runtime` external（0.1.2-alpha.3 已改名 `dsh-client-modules`，从未被 import；`neverBundle` 对未 import 的包是空操作）。`scripts/build-client.mjs` 本身也是 `tsc && tsdown` 之外的遗留脚本。

---

## 十、一句话总结

**本插件在 0.2.0 → 0.2.1 走廊上「零源码改动」再次成立：指南 §3 的 26 条组合改动与全部 Host/Client 契约改动逐条未命中，8 处 cast 型 seam 逐个在 rc.2 源码确认同形；唯一真实改动是依赖范围，而这里踩到并定位到一个隐蔽得多的坑 —— pnpm 11 的发布隔离窗口（`minimumReleaseAge`，默认 1 天）把刚发布的 rc.2 判为不可解析、静默回退到 rc.1，且它只认按包名的豁免格式；处置是按名豁免整个 `@deepseek-ai/dsh-*` scope 并把窗口显式写出，范围则取 `^0.2.1-rc.2`，代价是 `0.2.1-rc.1` 宿主被拒、插件与宿主必须同批次升级。**

# dsh-user-approval-mode v0.13.0 升 DSH v0.2.2-rc.3 兼容性审计

- **对象**：`dsh-user-approval-mode` `0.12.0` → `0.13.0`（分支 `chore/dsh-0.2.2-rc.3`，基线 `main@a9acebc`，`v0.12.0` tag 在 `4b9b306`）
- **指南**：`deepseek-harness/DSH-0.2.2-rc.3-插件升级指南.md`（§4.3 给出本插件的必修面）
- **目标运行时**：`0.2.2-rc.3`（源码快照 `../deepseek-harness-dsh-v0.2.2-rc.3`，`package.json:3`）
- **本机宿主**：`@deepseek-ai/dsh@0.2.2-rc.1`（运行时 checkout `../deepseek-harness-dsh-v0.2.2-rc.1`，版本只读该树 `package.json:3`；指南 §8.2 同样记录宿主仍为 rc.1）
- **执行日期**：2026-11-14

本轮**执行了**安装、锁文件重生成、类型检查、137 个测试、构建与兼容门实算；**没有执行** 0.2.2-rc.3 宿主上的冷启动 / 浏览器验证——本机宿主仍是 rc.1（§十、§十一）。

## 一、结论

1. **无需契约级源码重写。** rc.3 类型下 `pnpm typecheck` 0 错误、`pnpm test` 137 通过、`pnpm build` 成功；指南 §3 的废弃/改名清单在 `src/` 命中 0 条（§六）。
2. **`src/` 零改动，`lib/` 无 diff。** 在 rc.3 类型下重建的产物与已提交的 `lib/` 逐字节一致（tsdown 的 CSS 类名映射按 local 名排序，构建可复现），所以 0.11.0 / 0.12.0 交付的那份产物同样服务本版本（§九）。
3. **依赖面是本轮唯一的实质改动**：15 个 `@deepseek-ai/dsh-*` devDeps 精确 `0.2.2-rc.1` → `0.2.2-rc.3`；`cordis` / `schemastery` 的 dev 钉保持宿主同版本 `4.1.0` / `3.19.0`；**peer 全部保持 `^0.2.1-rc.2` 宽范围**，安装下限不动（§二、§四）。
4. 兼容门**实算通过**：本插件 peer 集在 `0.2.2-rc.3`（以及 `0.2.2-rc.1`、`0.2.1-rc.5`）放行，在 `0.2.1-rc.1` 被拒；对照组（只把 `@deepseek-ai/dsh-tools` 一条 peer 精确钉成 `0.2.2-rc.1`）在 `0.2.2-rc.3` 下**被拒**，证明门不是恒真（§五）。
5. 指南 §4.3 的三条「建议（可选，不阻塞）」经复核后**不落地**，理由见 §八：结构化审批码不适用于本插件的消费面，两条陈旧遗留项属纯装饰性清理，留给后续专门轮次。

## 二、`package.json` 差异

| 字段 | 0.12.0 | 0.13.0 | 说明 |
|---|---|---|---|
| `version` | `0.12.0` | `0.13.0` | 含 tag 后 1 个未发布提交（`docs: add the run_code approval flow design page`）与本轮 rc 走廊 |
| 15 个 `@deepseek-ai/dsh-*` devDeps | `0.2.2-rc.1`（精确） | **`0.2.2-rc.3`（精确）** | devDeps 不进兼容门，只用于对着目标 rc 做类型验证；精确钉避免 pnpm 11 的 release-age 把新出的 rc 判回旧 rc |
| 15 个 `@deepseek-ai/dsh-*` peers | `^0.2.1-rc.2` | **不变** | `includePrerelease: true` 下覆盖 `0.2.2-rc.3`；下限仍排除 `0.2.1-rc.1` |
| `@deepseek-ai/cordis` devDep | `4.1.0` | **不变** | rc.3 的 vendor 底座与 rc.1 逐字节相同（指南 §1.3） |
| `@deepseek-ai/cordis` peer | `>=4.0.5` | **不变** | 同时接纳 `0.2.1-rc.x` 宿主的 4.0.5 与 `0.2.2-rc.x` 宿主的 4.1.0 |
| `@deepseek-ai/schemastery` devDep | `3.19.0` | **不变** | 同上（两树 3.19.0） |
| `@deepseek-ai/schemastery` peer | `>=3.18.5` | **不变** | 覆盖 3.19.0 |
| `dependencies` | `@rh854lkjd/dsh-tool-list-dir >=0.2.7`、`zod ^4.4.3` | **不变** | 它发 0.4.3 时 `>=0.2.7` 范围仍兼容（指南 §4.3 第 4 点） |

`pnpm-workspace.yaml` 未改：`minimumReleaseAgeExclude` 已按包名整段豁免 `@deepseek-ai/dsh-*` / `@deepseek-ai/cordis*` / `@deepseek-ai/cosmokit` / `@deepseek-ai/schemastery`，安装仍显式加 `--config.minimumReleaseAge=0`（指南 §2 Step 1.6）。

## 三、上游 corridor 逐项对照（只列可能命中项）

| rc.3 变化 | 本插件是否命中 | 依据 |
|---|---|---|
| 客户端删除 `useAnchoredPosition` / `AnchoredPositionOptions`，`Menu` 的 `getAnchorRect` 换成 `anchorRef` / `anchorPoint` | **否** | 两处菜单都用内联 `anchor={element}`：`src/client/ApprovalModeChip.tsx:97`、`src/client/ApprovalModeSettings.tsx:134`。rc.3 的 `ui-primitives/src/Menu.tsx:156,179,184-186` 仍接受 `anchor` / `portal`，新增的 `anchorRef` / `anchorPoint` 只是可选项；`useAnchoredPosition` 在 rc.3 树 grep 0 命中、在 rc.1 树有 7 处（`useAnchoredPosition.ts`、`index.ts:41-42`），而本插件 `src/` grep 0 命中 |
| slots 新增 `hoc` 种类（`SlotKind`、`PropsRenderSlots.renderSlot` 重载、`HocShare`） | **否（纯增量）** | `single/list/keyed/chain` 语义与 `ctx.slots.inject/register` 签名未变；插件只注入两个 occupant |
| `openSettings` 增加可选参 `sectionId?` | 否 | 插件不实现 settings launcher |
| `ProcessActivity` 新增 `context` 成员 | 否 | 插件不 import `ui-chat` 的 `ProcessActivity` |
| macOS 窗口拖动区域（`data-window-drag-exclude`） | 低（未验证） | 仅 macOS Desktop；两处菜单都用共享 `Menu`，风险低，留待宿主 rc.3 后目测 |
| Agent 运行时归属 / 子代理服务 API / `spawn_teammate` 删除 / `agent_id` 改名 | 否 | 插件不调 `ctx.agents` / `ctx.subagents`、不注册工具、不写 preset；`list_agents`、`wait_agent` 只是分类列表里的工具名，且 rc.3 仍注册这两个工具（参数语义变化不影响名字分类） |
| `SandboxUnsupportedPolicyError` 导出删除 | 否 | 插件只用 `ctx.sandboxPolicy` 的 `setSandboxMode` / `SandboxPolicyService`，指南 §4.3 已核实仍顶层导出；`src/` grep 0 命中 |
| `plugin-manager` 的 `BundleInfo.updatable` → `update` | 否 | 插件不读 `listBundles()` |
| `Session.append` 双重重载、`LlmErrorCode`、Office / CUA / Web 搜索 / 终端 / 账号 | 否 | 插件不包装 `append`、不 import `LlmError`、不消费这些能力 |
| 审批拒绝结果新增持久化 `error.info`（`ApprovalError` / `APPROVAL_*`，**无官方卡片**） | **否（不适用）** | 本插件的判定发生在 `tools/pre-execute`，从不读取已存储的工具结果；靠拒因字面量检测的是 `dsh-reject-policy`，不在本仓库范围 |

## 四、安装与锁文件

- `CI=true pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0 --store-dir=.pnpm-store`：成功，`node_modules` 重建，15/15 dsh devDeps 解析到 `0.2.2-rc.3`，`cordis 4.1.0` / `schemastery 3.19.0`。注：`.npmrc` 的 `store-dir` 在本轮 pnpm 11.28.5 下未生效（实际指到只读的 `~/.local/share/pnpm/store/v11` 并报 `ERR_PNPM_EROFS`），改用显式 `--store-dir=.pnpm-store` 后正常；仓库 `.gitignore` 已忽略 `.pnpm-store/`。
- lockfile 从 193 条增至 195 条；`grep '0\.2\.2-rc\.1' pnpm-lock.yaml` **0 命中**，importer 的 15 条 dsh devDeps 全部落在 `0.2.2-rc.3`。`pnpm install --frozen-lockfile --store-dir=.pnpm-store` → `Already up to date`。
- `pnpm peers check`（exit 1，均为既存 dev-only 旧链）：`@rh854lkjd/dsh-tool-list-dir@0.3.3` 要 `cordis ~4.0.4` / `schemastery ~3.18.4`，它拖入的 `@deepseek-ai/dsh-fs@0.2.0-rc.2` 要 `dsh-brand` / `dsh-llm` / `dsh-sandbox@0.2.0-rc.2`。与 0.10.0 / 0.11.0 同一条已接受旧依赖，未新增 rc.3 相关告警。
- 锁内仍有两个 `0.2.0-rc.2` 条目（`@deepseek-ai/dsh-fs`、`@deepseek-ai/dsh-invariants`），来源同上是 `dsh-tool-list-dir@0.3.3` 的旧链，不是本插件声明的 15 条。

## 五、兼容门实测

用**新树自带**的 `packages/boot/app-boot/lib/index.js` 的 `evaluatePluginCompatibility(manifest, exemptions?, runtimeVersion?)` 实算（脚本 `.dsh/gate-rc3.mjs`，临时文件、未入库）：

| 清单 | 运行时 | 结果 |
|---|---|---|
| 本插件现役 peer 集（15 × `^0.2.1-rc.2`） | `0.2.2-rc.3` | **PASS**（返回 `undefined`） |
| 本插件现役 peer 集 | `0.2.2-rc.1` | **PASS** |
| 本插件现役 peer 集 | `0.2.1-rc.5` | **PASS** |
| 本插件现役 peer 集 | `0.2.1-rc.1` | **REJECT**（15 条 `^0.2.1-rc.2` 全部 unmet） |
| 对照 A：`dsh-tools` 一条 peer 精确 `0.2.2-rc.1` | `0.2.2-rc.3` | **REJECT** `{"@deepseek-ai/dsh-tools":"0.2.2-rc.1"}` |
| 对照 B：同上但精确 `0.2.2-rc.3` | `0.2.2-rc.3` | PASS |
| 对照 C：`dsh-tools` 一条 peer 写 `^0.2.1`（无 prerelease） | `0.2.2-rc.3` | PASS（与上一轮实测、指南表格的直觉相反） |

补充证据：判定实现 `git diff --no-index` 比较 rc.1 与 rc.3 两树的 `packages/boot/app-boot/src/plugin-compatibility.ts`，**无输出 = 逐字节相同**，与指南 §1.2 一致；判定式仍是 `semver.satisfies(runtime, range, { includePrerelease: true })`，因此 `^0.2.1` 在 `0.2.2-rc.3` 上通过（`0.2.2-rc.3 > 0.2.1`），在 `0.2.1-rc.5` 上才失败。`^0.2.1-rc.2` 保留为 floor 是因为它同时排除 `0.2.1-rc.1`。

## 六、§3 废弃/改名清单核对（命中 0 条）

grep 词表（`path=src`，指南 §2 Step 4 + 附录 B）：

`useAnchoredPosition`、`AnchoredPositionOptions`、`getAnchorRect`、`spawn_teammate`、`agent_id`、`listBundles`、`updatable`、`updateBundle`、`SessionProjectionStateMap`、`cachedSnapshot`、`editing-cordis-compositions`、`cordis-composition-reference`、`cordis-plugin-development`、`ParentAgent`、`isOwnedBy`、`interruptByParent`、`SandboxUnsupportedPolicyError`、`LlmErrorCode`、`officeToPdf`、`dsh-invariants`、`dsh-deepseek-model-label-1017`

结果：**全部 0 命中**。为什么不可能是命中面：

- 插件注册的东西没变：一个 `tools/pre-execute` 钩子、两个 client slot occupant（`conversation.input.left` 的 chip 与 `settings.section` 的页面）、`/approval-mode` 命令、一次 `settings.configure`，以及经可选 `skills` 服务注册的 skill provider。不注册工具、不写 preset、不挂 bundle 行、不读 system-prompt 负载、不碰 projection / schedule / subagent / agent 运行时。
- 因此「Team/子代理工具面重写」「agent 运行时归属删除」「Office/CUA/Web 搜索重写」这些条目结构上落不到本仓库；真正能证明这一点的仍是 rc.3 类型下的 `tsc` 0 错误。

## 七、客户端契约面复核

rc.3 唯一与客户端编译面相关的变化是删除锚定菜单 hook（§三第一行）。本插件的两处菜单：

- `src/client/ApprovalModeChip.tsx:96-97`：`portal` + 内联 `anchor`，浮层渲染进 `document.body`（0.11.0 按 rc.1 的 composer slot 契约加的 portal，rc.3 继续支持）。
- `src/client/ApprovalModeSettings.tsx:134-136`：内联 `anchor`；本地 `useRef` 只挂在 anchor 内的按钮上，不是 `Menu` 的 `anchorRef` 属性。

rc.3 的 `Menu.tsx:127-128,179` 仍声明 `portal?: boolean`，`:156` 仍接受 `anchor`，`:184-186` 才是新增的 `anchorRef` / `anchorPoint`。因此本插件在 rc.1 与 rc.3 上的客户端类型面一致，产物无需改动。

## 八、指南「建议（可选，不阻塞）」的处置

1. **结构化审批码（指南 §3.5 / §4.3 建议 1）→ 不落地。** 本插件不做「在工具结果里找拒因文案」的检测；它决定请求是否放行，拒绝结果的新 `error.info.code = APPROVAL_REJECTED` 由宿主写进持久化结果，消费方是 `dsh-reject-policy`（`OFFICIAL_REJECTION_TEMPLATE` 字面量检测），属另一仓库。若未来本插件需要区分取消/拒绝，再单独评估。
2. **清 `reme_search`（建议 2）→ 暂缓。** reMe 已下线，该名字在 `readOnlyTools` 默认、`src/client/ApprovalModeSettings.tsx` FALLBACK、`src/index.ts:174` 与两个测试里各出现一次，属于惰性名字；删除需要同时改 4 处 + 重建 `lib/`，会与本轮「零源码改动、零产物 diff」的交付面混淆。留作后续专门清理，行为影响为零。
3. **`tsdown.config.ts:11` / `scripts/build-client.mjs:15` 的旧包名 `@deepseek-ai/dsh-client-runtime`（建议 3）→ 暂缓。** 该 external 从未被 import（实际产物只 require `react` / `react/jsx-runtime` / `ui-primitives`），`neverBundle` 对未 import 的包是空操作；0.2.1-rc.5 审计已将其记为历史遗留。与第 2 条同批处理更合适。
4. **tag 后 1 个未发布提交（建议 4）→ 一起发。** 分支从 `main@a9acebc` 切出，`docs: add the run_code approval flow design page` 随 0.13.0 一并推上 `main`。

## 九、静态验证记录（L1）

| 项 | 命令 | 结果 |
|---|---|---|
| 安装 | `CI=true pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0 --store-dir=.pnpm-store` | 成功；15/15 dsh devDeps `0.2.2-rc.3`；cordis 4.1.0 / schemastery 3.19.0 |
| 锁文件冻结安装 | `pnpm install --frozen-lockfile --store-dir=.pnpm-store` | `Already up to date`，锁文件与声明一致 |
| 锁文件版本 | `grep 0.2.2-rc.1 pnpm-lock.yaml` | 0 命中；importer 15 条为 `0.2.2-rc.3` |
| 类型检查 | `pnpm run typecheck`（`tsc -p tsconfig.test.json`） | 0 错误 |
| 测试 | `pnpm test` | `137` pass / `0` fail |
| 构建 | `pnpm build`（`tsc && tsdown`） | 成功，`lib/` 与已提交产物逐字节一致（`git status --short` 无 `lib/` 变化） |
| 兼容门 | rc.3 自带 `evaluatePluginCompatibility` | §五 表；目标 PASS、对照 REJECT |
| 门禁实现一致性 | `git diff --no-index` 两树 `plugin-compatibility.ts` | 无输出（逐字节相同） |
| 废弃 API 扫描 | `grep`（§六 词表，`path=src`） | 0 命中 |

## 十、实机验证清单（L2 / L4 / L5 / L6，本轮未执行）

**前置（缺一不可，否则清单会静默测到旧版本）**：

1. 本分支推远端 → `--ff-only` 合并 `main` → 按仓库惯例打 `v0.13.0` 并推 tag。安装面是 GitHub `main` tarball，**不推 main 就还是 0.12.0**。
2. 宿主已升到 `0.2.2-rc.3`（`dsh --version` 核对）。
3. `~/.dsh/profiles/web/package.json:20` 当前把本插件钉在 `github:…#4b9b306…`（0.12.0 的 fix 提交），发版后要把该 spec 换成新 tag / 新 commit（或跟 `#main`），否则 profile 仍跑旧代码。

然后在**干净 profile** 上按顺序做：

1. `dsh plugin --profile web add github:R-LEI2536/dsh-user-approval-mode`（注意是 `dsh plugin --profile … add`）；冷启动**没有** `dsh: disabling profile plugin row` / `skipping profile bundle "dsh-user-approval-mode"`。
   - 安装输出里出现 15 条 unmet peer 警告是**预期**：npm/pnpm 默认预发布规则不认 `^0.2.1-rc.2` 对 `0.2.2-rc.3`，判据是宿主门禁（`includePrerelease: true`）。若门禁拒收，症状是上面那两行日志，而不是警告本身。
   - 顺带预期：rc.3 把 `@deepseek-ai/dsh-experimental-agent-team-profile` 列入 `RETIRED_BUNDLES`（指南 §4.8），本机 `web` profile 的 `dsh.profile.bundles` 里有旧名，切换 rc.3 宿主后这一行会自动移除；agent-team 工具来自 `dsh-base`。
2. `--dump-config` 复核本插件 bundle 行存在且 config 生效。
3. Web UI：输入框左侧 chip 出现；点开模式菜单，确认浮层在 composer 之外、不被裁切（portal）；选择模式后 chip 文案与沙箱策略同步。
4. 设置 → 审批模式：页面加载、四个工具族输入、沙箱默认值、Reset 行为正常。
5. 浏览器控制台零 `slot entry crashed` / activation failure。
6. 语义层：新会话与已有会话各切一次模式；`/approval-mode` 命令与 chip 行为一致；触发一次真实拒绝时本插件的「五模式」行为不变（拒因结构化码属 `dsh-reject-policy` 的验证面）。
7. macOS Desktop（若适用）：打开 chip 菜单与设置页，确认浮层不被窗口拖动区域吞掉（§三第五行）。

## 十一、未验证 / 遗留

1. **本机宿主仍是 `0.2.2-rc.1`**，§十 全部未执行；本轮结论只到静态层 + 门禁实算。
2. **脑测的 unmet peer 警告未在真机验证**：npm/pnpm 默认语义不认 `^0.2.1-rc.2` → `0.2.2-rc.3`，预期 15 条警告（宿主门禁才是判据）；这条来自 rc.1 轮次的 semver 实测，本轮未重复安装真机 profile。
3. **`.npmrc` 的 `store-dir` 在 pnpm 11.28.5 下未生效**：本轮改用 `--store-dir=.pnpm-store` 显式指定。若后续每次都要带这个参数，可把 `storeDir` 写进 `pnpm-workspace.yaml`（属独立清理，不在本轮）。
4. **指南 §4.3 三条可选建议未落地**（§八），属有意延后，不是遗漏。
5. 遗留旧依赖 `@rh854lkjd/dsh-tool-list-dir@0.3.3` 及其 `dsh-fs@0.2.0-rc.2` / `dsh-invariants@0.2.0-rc.2` 混装：与 0.10.0 / 0.11.0 相同的 dev-only 产物，`src/` 不使用，未在本轮修复。
6. `package.json` 未加 `engines.node`：插件发布 `lib/` 产物、运行时不依赖插件侧 Node 版本；构建需要 Node ≥ 24.9.0（rc.3 的 `engines`，本机满足）。
7. **0.12.0 的 `lib/` 未重建**（本轮 `src/` 零改动，重建产物逐字节一致，故无 `lib/` diff）；这与指南 §2 Step 2「必须重建」的执行动作一致——重建已做，只是没有产生差异。

## 十二、一句话总结

0.13.0 是「抬依赖 + 重生成锁文件 + 门禁实算」的纯收尾版：`src/` 零改动、`lib/` 逐字节不变，兼容门在 `0.2.2-rc.3` 实测通过且对照组被拒，指南 §3 废弃清单 0 命中，实机验证等宿主升到 `0.2.2-rc.3` 后按 §十 执行。

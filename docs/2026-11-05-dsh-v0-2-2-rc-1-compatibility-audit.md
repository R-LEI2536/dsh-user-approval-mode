# dsh-user-approval-mode v0.11.0 升 DSH v0.2.2-rc.1 兼容性审计

- **对象**：`dsh-user-approval-mode` `0.10.0` → `0.11.0`（分支 `chore/dsh-0.2.2-rc.1`，基线 `main@e12ff9b`，`v0.10.0` tag 在 `a96c2ec`）
- **指南**：`deepseek-harness/DSH-0.2.2-rc.1-插件升级指南.md`（§4.3 给出本插件的必修面）
- **目标运行时**：`0.2.2-rc.1`（源码快照 `../deepseek-harness-dsh-v0.2.2-rc.1`，`package.json:3`）
- **本机宿主**：`@deepseek-ai/dsh@0.2.1-rc.5`（`dsh --version` 同），Node `24.18.0`
- **执行日期**：2026-11-05

本轮**执行了**安装、类型检查、测试、构建与兼容门实算，并用 registry 上的 `0.2.2-rc.1` 已发布 tarball 复核了 `apply_patch`；**没有执行** 0.2.2-rc.1 宿主上的冷启动 / 浏览器验证——本机宿主仍是 rc.5（§十、§十一）。

## 一、结论

1. **无需契约级源码重写。** rc.1 下 `pnpm typecheck` 0 错误、`pnpm test` 121 通过、`pnpm build` 成功；指南 §3 的废弃/改名清单在 `src/` 命中 0 条（§六）。
2. **需要两处实质改动**：
   - 依赖声明：15 个 `@deepseek-ai/dsh-*` devDeps 精确钉 `0.2.2-rc.1`；`cordis` / `schemastery` 的 dev 钉到宿主同版本 `4.1.0` / `3.19.0`；**peer 全部保持原宽范围**，安装下限不动（§二、§四）。
   - 源码：输入框 chip 的 `Menu` 加 `portal`。rc.1 首次把「composer slot 内固定浮层必须 portal 到 `document.body`」写进 slot 契约，rc.5 的同一文件没有这句话（§八）。
3. **`apply_patch` 条件项不落地**：rc.1 的 base bundle、Web `standard` preset、`tool-fs` schema 默认值三处都是 `false`（已用 registry 上的 rc.1 已发布 tarball 复核，见 §七），加到 `editTools` 会制造无人可用的行为变化。
4. 兼容门**实算通过**：本插件 peer 集在 `0.2.2-rc.1` 与 `0.2.1-rc.5` 都放行；对照组（只把 `@deepseek-ai/dsh-tools` 一条 peer 精确钉成旧 `0.2.1-rc.5`）在 `0.2.2-rc.1` 下**被拒**，证明门不是恒真（§五）。

## 二、`package.json` 差异

| 字段 | 0.10.0 | 0.11.0 | 说明 |
|---|---|---|---|
| `version` | `0.10.0` | `0.11.0` | 含 3 个未发布提交（`.gitignore` 清理、skill、文档）与本次 rc 走廊 |
| 15 个 `@deepseek-ai/dsh-*` devDeps | `^0.2.1-rc.5` | **`0.2.2-rc.1`（精确）** | caret 范围跨不了 prerelease 段（实测 `^0.2.1-rc.5` 的 `maxSatisfying` 仍是 `0.2.1-rc.5`），上一走廊还叠加了 release-age 回退；devDeps 不进兼容门，只用于对着目标 rc 做类型验证 |
| 15 个 `@deepseek-ai/dsh-*` peers | `^0.2.1-rc.2` | **不变** | `includePrerelease: true` 下覆盖 `0.2.2-rc.1`；下限仍排除 `0.2.1-rc.1` |
| `@deepseek-ai/cordis` devDep | `>=4.0.5`（实际解析 4.0.5） | **`4.1.0`（精确）** | rc.1 的宿主包 peer 已变 `~4.1.0`，dev 树留在 4.0.5 会给出 unmet peer 且类型面不是宿主的 |
| `@deepseek-ai/cordis` peer | `>=4.0.5` | **不变** | 同时接纳 `0.2.1-rc.x` 宿主的 4.0.5 与 `0.2.2-rc.1` 宿主的 4.1.0 |
| `@deepseek-ai/schemastery` devDep | `>=3.18.5`（实际解析 3.18.5） | **`3.19.0`（精确）** | 同上；rc.1 里 schemastery 的 `~3.19.0` peer 只出现在 dsh-settings（其他被消费的 rc.1 包不声明 schemastery），`~3.18.5` 写法会挡 3.19.0，本插件原本就是 `>=`，只是锁文件停在旧版 |
| `@deepseek-ai/schemastery` peer | `>=3.18.5` | **不变** | 覆盖 3.19.0 |

`pnpm-workspace.yaml`：`minimumReleaseAgeExclude` 在原 `@deepseek-ai/dsh-*` 之外新增 `@deepseek-ai/cordis*`、`@deepseek-ai/cosmokit`、`@deepseek-ai/schemastery`。原因见 §四：rc.1 走廊的底座库与 rc.1 同一发布窗口内发布，1440 分钟隔离期会把它们拒之门外。

## 三、上游 corridor 逐项对照（只列可能命中项）

| rc.1 变化 | 本插件是否命中 | 依据 |
|---|---|---|
| `dsh-tools` 拆出执行器；`mode` / `maxParallelSubCalls` 变 `z.never()` | 否 | 插件不挂 `tools` 行，只挂 `tools/pre-execute` 钩子 |
| PTC 导出搬家（`CodeRunFailedError`、`jsonSchemaToTs`…） | 否 | `src/` 无这些名字（§六） |
| `system-prompt/assemble` 不再携带 tools | 否 | 插件不监听该 waterfall，也不读 `assembly.tools` |
| 删除 `tool-subagent-control/list-agents` 子入口 | 否 | 插件不写 preset/patch 行；`readOnlyTools` 里的 `list_agents` 是工具名，rc.1 主入口仍注册它 |
| `modelSelectionSettings` → `modelSelection` | 否 | 插件不配置 subagent 行 |
| bundle 清单搬到 `dsh-official-bundles` | 否 | 插件不导入这些清单，也不子类化 `EntryTree`；自己的 `cordis.patch.yml` 只有一行 `insert` 自身 |
| `fs-observation-policy` 默认关闭、`apply_patch` 默认关 | 是（语义） | §七：分类面不需要改 |
| 删除 `ui-deepseek-model-label-1017` | 否 | 插件不引用 |
| client 契约：`Menu`/`Input`/`Switch`/icons、`PropsRuntime`/`InjectFace`、`ConfigForm`、`settings.section`、`conversation.input.left` | 否（除新增 portal 要求） | rc.1 下 `tsc` 0 错误；唯一行为新增是 §八 的 portal 条款 |
| `ChatViewInjected` / `DraftFileUpload` / `InputState.phase` / `SubmitAttempt` 等重写 | 否 | 插件不实现这些 occupant，不穷尽 switch 这些类型 |
| `ApprovalService` 需 `sessionProjections` | 否 | 插件消费 `ctx.permissionPresets` / `ctx.sandboxPolicy`，不创建 `ApprovalService`；宿主服务的装配属宿主侧 |
| `session.append()` 窗口、projection 帧、Schedule 重写 | 否 | 插件不写 session append、不读 projection 帧、不用 Schedule |
| Node `>=24.9.0` | 是（构建环境） | 本机 Node 24.18.0 满足；`package.json` 未加 `engines`（插件发布的是 `lib/` 产物，运行时不依赖插件侧 Node 版本） |
| `cordis` 4.0.5 → 4.1.0、`schemastery` 3.18.5 → 3.19.0 | 是（依赖面） | devDeps 精确钉宿主版本；peer 保持宽范围，见 §二 |

## 四、安装与锁文件

第一次 `pnpm install --store-dir=.pnpm-store` 失败：

```
[ERR_PNPM_NO_MATURE_MATCHING_VERSION] 5 versions do not meet the minimumReleaseAge constraint:
  @deepseek-ai/cordis-plugin-group@1.1.0
  @deepseek-ai/cordis-plugin-include@1.1.0
  @deepseek-ai/cordis-plugin-loader@1.1.0
  @deepseek-ai/cosmokit@1.9.0
  @deepseek-ai/schemastery@3.19.0
```

把这 5 个名字对应的 3 条 scope/包名加入 `minimumReleaseAgeExclude` 后安装成功（`pnpm-workspace.yaml` 里写明了原因，且没有扩大到整个 scope）。结果：

- lockfile 193 个条目；顶层 importer 的 15 条 `@deepseek-ai/dsh-*` devDeps 全为 `0.2.2-rc.1`，`grep '0\.2\.1-rc\.' pnpm-lock.yaml` **0 命中**。锁内仍有两个 `0.2.0-rc.2` 条目（`@deepseek-ai/dsh-fs@0.2.0-rc.2`、`@deepseek-ai/dsh-invariants@0.2.0-rc.2`），来自下面那条旧依赖链，不是本插件声明的 15 条。
- 顶层解析：`@deepseek-ai/cordis@4.1.0`、`@deepseek-ai/schemastery@3.19.0`、cordis-plugin-* `1.1.0`。
- `@deepseek-ai/dsh-invariants` **不是新增声明**——`dsh-invariants@0.2.0-rc.2` 仍只由既存的 `@rh854lkjd/dsh-tool-list-dir@0.3.3` 拖入，`src/` 不引用，沿用 0.10.0 的「接受、不修」决策。
- 遗留 peer 警告（`pnpm peers check`，均来自同一条已接受的旧依赖）：`dsh-tool-list-dir@0.3.3` 要 `cordis ~4.0.4` / `schemastery ~3.18.4`，其 `dsh-fs@0.2.0-rc.2` 要 `dsh-brand`/`dsh-llm`/`dsh-sandbox@0.2.0-rc.2`。dev-only、运行时无关。

## 五、兼容门实测

宿主 `0.2.1-rc.5` 自带的 `@deepseek-ai/dsh-app-boot`（`evaluatePluginCompatibility(manifest, exemptions?, runtimeVersion?)`）与 rc.1 的判定实现逐字节一致（指南 §1.1），所以直接在 rc.5 宿主上把 `runtimeVersion` 传 `0.2.2-rc.1` 实算：

| 清单 | 运行时 | 结果 |
|---|---|---|
| 本插件现役 peer 集（15 × `^0.2.1-rc.2`） | `0.2.2-rc.1` | **PASS**（返回 `undefined`） |
| 本插件现役 peer 集 | `0.2.1-rc.5` | **PASS** |
| 对照 A：只把 `@deepseek-ai/dsh-tools` 一条 peer 钉 `0.2.1-rc.5`，其余 peer 不声明 | `0.2.2-rc.1` | **REJECT** `{"@deepseek-ai/dsh-tools":"0.2.1-rc.5"}` |
| 对照 B：同上，但钉 `0.2.2-rc.1` | `0.2.2-rc.1` | PASS |
| 对照 C：只把 `@deepseek-ai/dsh-tools` 一条 peer 写成 `^0.2.1`（无 prerelease） | `0.2.2-rc.1` | **PASS（与指南表不符）** |

最后一行是本轮实测与指南 §1.1 表格的明确冲突：指南按「`includePrerelease: false` 的直觉」把 `^0.2.1` 标成拒绝，但宿主判定式是 `semver.satisfies(runtime, range, { includePrerelease: true })`，而 `0.2.2-rc.1 > 0.2.1`，所以 `^0.2.1` 在 rc.1 下**通过**（在 `0.2.1-rc.5` 下它才失败，因为 `0.2.1-rc.5 < 0.2.1`）。结论：不要转发指南那张表；以本节的实算为准。本插件仍保留 `^0.2.1-rc.2` 作为 floor，因为它同时排除 `0.2.1-rc.1`（实测 false），这是 0.9.0 起就定下的安装下限。

`cordis` / `schemastery` 不进兼容门（门只判 `@deepseek-ai/dsh*`），但它们的 peer 范围也一并核对：`4.0.5` 与 `4.1.0` 都满足 `>=4.0.5`，`3.19.0` 满足 `>=3.18.5`。

## 六、§3 废弃/改名清单核对（命中 0 条）

grep 词表（`path=src`，指南 §3 + §4.3 客户端契约面）：

`tool-subagent-control/list-agents`、`modelSelectionSettings`、`list_subagent_models`、`MenuTarget`、`useMenuTarget`、`ctx.menus`、`maxParallelSubCalls`、`CodeRunFailedError`、`jsonSchemaToTs`、`renderToolsSdk`、`defineContentToolFixture`、`assembly.tools`、`dsh-invariants`、`dsh-client-ui-deepseek-model-label-1017`、`send_button_click`、`PropsRenderFactories`、`ApprovalComposerProps`、`ChatViewInjected`、`DraftFileUpload`、`SubmitAttempt`、`entry.write`、`applyEntryPatches`、`SessionProjectionStateMap`、`system-prompt/assemble`、`conversation.composer`

结果：**全部 0 命中**。为什么不可能是命中面：

- 插件注册的东西很少：一个 `tools/pre-execute` 钩子、两个 client slot occupant（`conversation.input.left` 的 chip 与 `settings.section` 的页面）、`/approval-mode` 命令、一次 `settings.configure`，以及经可选 `skills` 服务注册的 skill provider。不注册工具、不写 preset、不挂 bundle 行、不读取 system-prompt 负载、不碰 projection/schedule/analytics。
  其中 skill provider 是本地结构类型、不在 `tsc` 覆盖内，已额外对 rc.1 源码复核 `SkillProvider` / `registerProvider` 签名未变（`packages/skill/skill/src/index.ts:390`）。
- 因此「工具执行器拆分」「条件工具」「bundle 清单搬家」「上下文菜单改名」「ChatView/InputState 重写」这些条目在结构上就落不到本仓库；真正能证明这一点的仍是 rc.1 类型下的 `tsc` 0 错误。
- 唯一被 rc.1 新写进契约的是 portal 条款（§八），已改。

## 七、`apply_patch` 判定（条件项 → 不落地）

指南 §4.3 把它列为「待 rc.1 实机确认」，§1.5 要求「以 rc.1 实际 tarball 复核后再落地」。本轮照做：用 `pnpm view … dist.tarball` 取 registry 上 `0.2.2-rc.1` 的已发布 tarball、解包后逐处核对（不是只看源码快照）：

- `@deepseek-ai/dsh-base@0.2.2-rc.1` 的 `cordis.patch.yml:296-300` → `tool-fs.config.applyPatch: false`（同文件 `:501-505` 有 `tool-executor-native` / `tool-executor-ptc` 行，`:292-294` 的 `fs-observation-policy` 是 `disabled: true`）。
- `@deepseek-ai/dsh-web-app@0.2.2-rc.1` 的 `presets/standard.patch.yml:27-31` → `applyPatch: false`。
- `@deepseek-ai/dsh-tool-fs@0.2.2-rc.1` 的 `lib/index.js:1957` → `applyPatch: z.boolean().default(false)`。

三处一致，结论与源码快照相同：rc.1 实际发布包里 `apply_patch` 默认关闭。所以本轮**不加** `apply_patch` 到 `editTools`（schema 默认与 `FALLBACK.editTools`、测试期望都不动）。指南要求的「同时复核 `cordis.patch.yml` 的 `editTools` 行」也做了：本仓库 `cordis.patch.yml:7` 的 `editTools` 没有 `apply_patch`，保持不动。部署方若自行开启该工具，需把它加进 `editTools`，否则落到 `unclassified: ask`；该说明写进了两份 README 的 0.11.0 段落。

## 八、客户端源码改动：菜单 portal

rc.1 的 slot 契约（`packages/client/ui-conversation/src/client/contract/slots.ts:307-311`）首次为 composer 区写下：

> Compact controls at the left of the composer tool row; fixed overlays must portal to the document body because the docked composer contains them.

rc.5 的同一文件对该 slot **没有任何 portal 要求**（旧树 grep `portal` 0 命中），说明这是本走廊新增的契约条款。本插件该 slot 的实现 `src/client/ApprovalModeChip.tsx` 的 `Menu` 之前没有传 `portal`，`Menu` 默认 `portal=false`（新旧树的 `ui-primitives/src/Menu.tsx` 都是这个默认，`portal` 属性 rc.5 就已存在），于是浮层留在被裁切的 composer 内。

改法：给该 `Menu` 加 `portal`（不加 `getAnchorRect`——wrapper 包裹的 anchor button 位置足够），并补注释说明依据。`lib/` 是仓库提交的产物，本轮 `src/` 有改动，因此 `pnpm build` 后把 `lib/` 一并提交（`lib/client.js` 只多出 portal 与注释，其余 map 变化是行号位移）。`settings.section` 里的另一个 `Menu` 不在 composer 悬浮区，不需要 portal。

## 九、静态验证记录（L1）

| 项 | 命令 | 结果 |
|---|---|---|
| 安装 | `pnpm install`（`store-dir` 已由 `.npmrc` 指定为 `.pnpm-store`） | 成功；顶层 importer 15/15 dsh devDeps `0.2.2-rc.1`；cordis 4.1.0 / schemastery 3.19.0；lock rc 计数见 §四 |
| 锁文件冻结安装 | `pnpm install --frozen-lockfile` | `Already up to date`，锁文件与声明一致 |
| 范围语义 | 宿主 `semver.maxSatisfying` | `^0.2.1-rc.5` → `0.2.1-rc.5`（到不了 rc.1）；`^0.2.1-rc.2` → `0.2.1-rc.5`；`0.2.2-rc.1` / `^0.2.2-rc.1` → `0.2.2-rc.1` |
| 类型检查 | `pnpm typecheck`（`tsc -p tsconfig.test.json`） | 0 错误 |
| 测试 | `pnpm test` | `121` pass / `0` fail |
| 构建 | `pnpm build`（`tsc && tsdown`） | 成功，`lib/` 更新（仅 portal + 注释 + map 行号） |
| 构建可复现 | 重跑 `pnpm build` 后 `git status --short` | 空输出，工作树与已提交的 `lib/` 一致 |
| 兼容门 | 宿主 `evaluatePluginCompatibility` | §五 表 |
| 废弃 API 扫描 | `grep`（§六 词表） | 0 命中 |

## 十、实机验证清单（L2 / L4 / L5 / L6，本轮未执行）

**前置（缺一不可，否则清单会静默测到旧版本）**：

1. 本分支推远端 → `--ff-only` 合并 `main` → 按仓库惯例打 `v0.11.0` 并推 tag。安装面是 GitHub `main` tarball（profile 里写 `github:R-LEI2536/dsh-user-approval-mode`，不带 ref），**不推 main 就还是 0.10.0**。
2. 宿主已升到 `0.2.2-rc.1`（`dsh --version` 核对）。

然后在**干净 profile** 上按顺序做：

1. `dsh plugin --profile web add github:R-LEI2536/dsh-user-approval-mode`（注意是 `dsh plugin --profile … add`；`dsh --profile …` 只是启动 profile，`add` 会被当成 app 参数传下去）；冷启动**没有** `dsh: disabling profile plugin row` / `skipping profile bundle "dsh-user-approval-mode"`。
   - 安装输出里出现 15 条 unmet peer 警告是**预期**：npm/pnpm 默认预发布规则不认 `^0.2.1-rc.2` 对 `0.2.2-rc.1`，判据是宿主门禁（`includePrerelease: true`）。若门禁拒收，症状是上面那两行日志，而不是警告本身。
   - 顺带核对插件实际装到的是哪套 dsh 包（本机现有插件目录带着一整套 `0.2.1-rc.5` peer 副本，属于 devDeps 证据，不代表干净 tarball 安装的结果）。
2. `--dump-config` 复核本插件 bundle 行存在且 config 生效。
3. Web UI：输入框左侧 chip 出现；**点开模式菜单，确认菜单渲染在 composer 之外、不被裁切**（本轮的 portal 改动）；选择模式后 chip 文案与沙箱策略同步。
4. 设置 → 审批模式：页面加载、四个工具族输入、沙箱默认值、Reset 行为正常。
5. 浏览器控制台零 `slot entry crashed` / activation failure。
6. 若部署方开启 `applyPatch: true`：确认 `apply_patch` 落在 `unclassified: ask`（或按 §七 提示加进 `editTools` 后落 edit 族）。
7. 语义层：新会话与已有会话各切一次模式；`/approval-mode` 命令与 chip 行为一致。

## 十一、未验证 / 遗留

1. **本机宿主仍是 `0.2.1-rc.5`**，所以 §十 全部未执行；本轮结论只到静态层 + 门禁实算 + 已发布 tarball 复核。
2. **安装期的 unmet peer 警告未在真机验证**：npm/pnpm 默认语义不认 `^0.2.1-rc.2` → `0.2.2-rc.1`，预期会有 15 条警告（宿主门禁才是判据）。这条结论来自 semver 实测（§九「范围语义」），不是安装日志。
3. **portal 在 `0.2.1-rc.2` / `rc.3` 宿主上的表现未验证**：rc.5 的 `Menu` 已支持该属性；若更早的实现不读它，则按旧行为原地渲染，不会崩，但裁切问题仍然存在。安装 floor 不动，接受这个差异。
4. 指南 §8 的未验证项（`apply_patch` 文档/代码冲突、主题、实验包等）与本插件无关，未重复核对。
5. 遗留旧依赖 `@rh854lkjd/dsh-tool-list-dir@0.3.3` 及其 `dsh-fs@0.2.0-rc.2` 混装：与 0.10.0 相同的 dev-only 产物，未在本轮修复（`src/` 不使用）。
6. `package.json` 未加 `engines.node`：插件发布 `lib/` 产物、运行时不依赖插件侧 Node 版本；但**构建**需要 Node ≥ 24.9.0（rc.1 的 `engines`），本机 24.18.0 满足。

## 十二、一句话总结

0.11.0 是「抬依赖 + 重建产物 + 一行 portal 修正」的收尾版：契约层零重写，兼容门实测通过且对照组被拒，`apply_patch` 条件项已用 rc.1 已发布 tarball 复核为关闭、不落地，实机验证等宿主升到 `0.2.2-rc.1` 后按 §十 执行。

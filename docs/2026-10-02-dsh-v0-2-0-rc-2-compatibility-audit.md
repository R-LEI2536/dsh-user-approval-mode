# dsh-user-approval-mode v0.6.0 升 DSH v0.2.0-rc.2 兼容性审计

**日期**: 2026-10-02
**审计基线**: `deepseek-harness` tag `dsh-v0.1.7-rc.2` = `477b4f42` ↔ `dsh-v0.2.0-rc.2` = `639ed015`；本仓 HEAD = `3d1335c`（`main`，工作区 clean）
**审计目标**: `dsh-user-approval-mode` 从 `^0.1.7-rc.1` 抬到 DSH `0.2.0-rc.1+` 依赖线
**审计范围**: 仅本插件（用户指定单仓）；fleet 其余 5 仓、主机 checkout、运行中宿主不在本次范围
**审计结论**: ✅ **只改依赖范围与文档，`src/**` / `test/**` / `cordis.patch.yml` 零改动**；实机（L2–L5）验证按用户决定推迟到宿主升级那一轮

---

## 一、本地基线状态

| 项目 | 值 |
| --- | --- |
| 本仓 HEAD / 分支 | `3d1335c chore(config): widen bundled default tool lists` / `feature/dsh-0.2.0-upgrade` |
| 插件版本（改动前 → 后） | `0.6.0` → `0.7.0` |
| peer `@deepseek-ai/dsh-*` | 15 条（`package.json:34-48`），改动前全 `^0.1.7-rc.1` |
| dev `@deepseek-ai/dsh-*` | 15 条（`package.json:54-68`），同上 |
| 不动项 | `@deepseek-ai/cordis >=4.0.4`、`@deepseek-ai/schemastery >=3.18.4`、`react ^18.2.0`、`@rh854lkjd/dsh-tool-list-dir >=0.2.6`、`zod ^4.4.3` |
| 形态 | `dsh.bundle.patch` = `./cordis.patch.yml` ⇒ **bundle 包** |
| 包管理器 | pnpm 11.7.0，`lockfileVersion: '9.0'`，`autoInstallPeers: true` |

---

## 二、结论与改动

1. `package.json`：30 处 `"^0.1.7-rc.1"` → `"^0.2.0-rc.1"`（15 peer + 15 dev，`grep -c` 复核 0 / 30）。
2. `pnpm-lock.yaml`：重解到 `0.2.0-rc.2` 家族（`0.2.0-rc.2` 出现 253 次）。锁文件只登记 `dependencies` / `devDependencies` 的 specifier，所以 `specifier: ^0.2.0-rc.1` 是 **15 条**（非 30 条）；peer 侧以 `package.json` 复核，另 2 处残留 `^0.1.7-rc.1` 是 `tool-list-dir@0.2.6` 自己声明的 peer（见第六节）。
3. `version` → `0.7.0`，`CHANGELOG.md` / `README.md` / `README.zh.md` / `CONTEXT.md` 同步，新增本审计文档。
4. **无源码改动**：逐包对照见第三节。

范围写法刻意用 `^0.2.0-rc.1`，不用 `^0.2.0` / `~0.2.0`（不含 prerelease，**当下即被拒**）、不用精确 `0.2.0-rc.2`（下个 rc 立刻又失效）、不用 `>=0.2.0-rc.1`（丢上限保护）、不用 `workspace:*`（npm 外部插件不可用）。

---

## 三、上游逐包对照（`git diff dsh-v0.1.7-rc.2 dsh-v0.2.0-rc.2`）

**`src/**` 零 diff 的消费包**（命令输出为空）：

`core/settings`、`core/commands`、`core/tools`、`permission-presets`、`client/ui-slots`、`client/ui-settings`、`client/ui-session`、`client/locale`、`llm/llm`、`core/agent`、`core/agent-default-model`、`shell/shell`、`core/system-prompt`、`fs/fs`

**有改动但为加法/放宽的消费包**：

| 包 | 改动 | 对本插件的影响 |
| --- | --- | --- |
| `client/ui-primitives` | `index.ts` 仅 +2 行导出（`MenuGroup`/`observeStickyMenuGroups`、`pointerModality`）；`Input.tsx` 改 `forwardRef`（**props 一字不变**）；`Menu.tsx` 未改；`icons/index.tsx` 仅 `IconThinkOutlineArtwork` 图形变 | 无（用到 `Menu` / `Input` / `IconChevronDownOutlineRegular`，均在原状或仅放宽） |
| `client/ui-conversation` | `input/*`、`apply.ts`、`contract/{draft-editor,input,composer-submission}.ts` 增量；新增 `submission-analytics.ts`；**`contract/slots.ts` 未改** | 无（只用 `conversation.input.left` 席位） |
| `api/remotes` | `client/index.ts` 仅新增 `productAnalyticsRemote` / `userQuestionsRemote` 挂载与类型导出 | 无（`ctx.remote.commands.execute` 用法不变） |
| `core/session` | `index.ts` 仅新增 `ToolCallRecovery` 导出；`repair.ts` 重写 | 无（不消费 `openTurnClosers` / 恢复链） |
| `client/ui-renderer` | `scoped-slots.tsx` 仅 `useMemo` 上移一行（hook 顺序修正，行为等价） | 无 |

**不消费但改动的包**：`sandbox/sandbox-local`（Windows-only ACL 诊断 skill 注册）、`sandbox/sandbox-windows-acl`（新增诊断 skill/脚本）。本插件用的是 `dsh-sandbox` / `dsh-sandbox-policy`，两者 `src/**` 零 diff。

**本插件实际消费面**：Host 侧 `ctx.settings.configure`、`ctx.get('sandboxPolicy' | 'permissionPresets' | 'llm' | 'agentDefaultModel' | 'shell')`、`ctx.inject(['settings' | 'commands'])`、`ctx.on('tools/pre-execute')`；Client 侧 `ctx.slots.register`（`conversation.input.left` + `settings.section`）、`ctx.locale`、`ctx.remote.commands.execute`、`ctx.configForms.get`、`Menu` / `Input` / `IconChevronDownOutlineRegular`、`PropsRuntime` / `InjectFace` / `ConfigForm`。

---

## 四、兼容门机制与失败模式

门源码 `packages/boot/app-boot/src/plugin-compatibility.ts:61-88`（两树逐字相同）：

- 只读 `peerDependencies`；只判名字等于 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的项（`cordis` / `schemastery` / `@rh854lkjd/*` 一律跳过）；
- `workspace:^` / `workspace:~` / `workspace:*` 视为当前运行时；
- 判定 `semver.satisfies(runtime, range, { includePrerelease: true })`；
- **不读 `peerDependenciesMeta.optional`**（本插件无 optional，此项无关）。

**失败模式是整包跳过，不是禁用某一行**：本包带 `dsh.bundle.patch`，`profile.ts:670-680` 对 bundle 包做同样的兼容判定，失败即 `throw` → `skippedBundles` → 启动器打印 `dsh: skipping profile bundle "dsh-user-approval-mode"`，chip 与设置页整体不加载。（普通 row 形态才是 `compatibility-preflight.ts:82` 的 `disabling profile plugin row`。）

**门谓词静态实测**（复刻上述过滤 + 判定，`semver@7.8.5`，不依赖宿主）：

| 时点 | runtime | 不兼容 peer 数 |
| --- | --- | --- |
| 改动前 | `0.2.0-rc.2` | **15**（全部为 `^0.1.7-rc.1`） |
| 改动前 | `0.1.7-rc.2` | 0 |
| 改动后 | `0.2.0-rc.2` | **0** ✅ |
| 改动后 | `0.1.7-rc.2` | **15**（全为 `^0.2.0-rc.1`） |

最后一行是"抬版后旧宿主要拒收"的书面证据 ⇒ **插件发版与宿主升级必须同批次**。

**semver 事实**：`^0.2.0-rc.1` ⇒ `>=0.2.0-rc.1 <0.3.0-0`，接纳 `0.2.0-rc.1/rc.2/rc.3/0.2.0/0.2.x`；`^0.2.0` / `~0.2.0`（`>=0.2.0 <0.3.0-0`）**不含** prerelease，当下为 false。

---

## 五、静态验证记录（L1）

**改动前基线**（0.1.7-rc.2 依赖）：`pnpm typecheck` ✅、`pnpm test` ✅ 83 passed、`pnpm build` ✅。

**改动后**（0.2.0-rc.2 依赖）：

| 步骤 | 结果 |
| --- | --- |
| 干净重装 `pnpm install` | exit 0；110 packages；15 个 `@deepseek-ai/dsh-*` 全部 `0.2.0-rc.2`；`cordis 4.0.4` / `schemastery 3.18.4`；**无 peer 警告**；pnpm 11 供应链策略校验（188 entries）通过 |
| `pnpm typecheck` | exit 0（零错误 ⇒ 印证"src 零改动"） |
| `pnpm test` | exit 0，**83 passed / 0 failed** |
| `pnpm build` | exit 0，`lib/index.js` / `lib/index.d.ts` / `lib/client.js` 正常产出 |

**产物零变化举证**：在 HEAD（0.1.7 依赖）的 git worktree 里另建一份产物，与本仓（0.2.0 依赖）产物按路径逐文件比对 —— **43 个产物中 42 个逐字节一致**，唯一差异是 `lib/client.js`，成因已定位且与 DSH 版本无关：

1. **构建目录路径进入产物**：bundle 里有一条 `//#region \0dsh-css:<绝对路径>.mjs` 注释，且 `tsdown.config.ts` 的 CSS Modules 用 `pattern: '[hash]_[local]'`，实测 lightningcss 的 `[hash]` **随 filename 变化**（同一份 CSS、两个不同路径 → `Egx4zG_container` vs `FATkTq_container`）。worktree 路径不同 ⇒ 类名前缀不同。
2. **CSS class map 键序不稳定**：同目录连续两次 build 的 `lib/client.js` hash 也不同，逐字节差异仅为注入对象里 `"mode"` 键的位置（`FATkTq_mode` 在 4 位 → 末位）。类名集合与内容一致。

⇒ 结论：产物差异是构建工具行为（路径相关 hash + 键序不稳定），不是依赖抬版引起的语义变化。

---

## 六、依赖树残留（已决策接受）

`@rh854lkjd/dsh-tool-list-dir@0.2.6` 声明的是 0.1.7 era peers，实际解析为：

| 其声明 peer | 实际链接 | 说明 |
| --- | --- | --- |
| `dsh-tools: ^0.1.7-rc.1` | `0.2.0-rc.2` | 不满足声明范围；pnpm 未报 warning |
| `dsh-fs: ^0.1.7-rc.1` | `0.0.1-rc.1` | 陈旧的 0.0.1 cohort 仍在树里 |
| `dsh-system-prompt: 0.1.1-rc.2` | `0.1.1-rc.2` | `pnpm-workspace.yaml` override 改写了该 peer 范围 |
| `cordis: ~4.0.4` / `schemastery: ~3.18.4` | `4.0.4` / `3.18.4` | 正常 |

本轮已按用户决定"只抬 peer，下限保持 `>=0.2.6`"。彻底清理需要文档 §2.6 的下一步：`tool-list-dir` 发 0.2.7 抬到 `^0.2.0-rc.1`，本仓下限随之抬到 `>=0.2.7`；同时重估 `dsh-system-prompt` override（其理由"故意压 0.1.1-rc.2"属 0.1.x 时代；已发布 `dsh-tools@0.2.0-rc.2` 的 peer 精确要求 `0.2.0-rc.2`）。**本轮未触发安装失败，故未改动 `pnpm-workspace.yaml`。**

**后续批（0.2.7 批次，已执行）**：`tool-list-dir@0.2.7` 已发布并把 peer 抬到 `^0.2.0-rc.1`（`dsh-fs`/`dsh-tools`/`dsh-system-prompt ^0.2.0-rc.1`、`cordis ~4.0.4`、`schemastery ~3.18.4`）。本仓：`package.json` 下限 `>=0.2.6` → `>=0.2.7`；删除 `pnpm-workspace.yaml` 的 `dsh-system-prompt: 0.1.1-rc.2` override 及其 `pnpm-lock.yaml` `overrides:` 块；lock 重解后 `dsh-system-prompt` 全树 `0.2.0-rc.2`，无 `0.1.1-rc.2` 残留。**残留一项未消除**：list-dir 0.2.7 的 `dsh-fs ^0.2.0-rc.1` peer 在树内仍链接陈旧的 `dsh-fs@0.0.1-rc.1`（`--force` 与全新重装均复现；`pnpm peers check` 报 unmet，但安装/typecheck/test/build 均过，DSH 兼容门只读本插件自己的 `@deepseek-ai/dsh-*` peers，不受影响）。

---

## 七、推迟的实机验证清单（宿主升到 0.2.0-rc.2 那一轮执行）

按 `DSH-0.2.0-UPGRADE-PLAN.md` §4 的 L2–L5，逐条给可判定的信号：

1. **L2 安装门**：`dsh plugin --profile <p> add/update <spec>` → exit 0；stderr 无 `incompatible-version`、无 `dsh: to accept the risk`。
2. **L3 冷启动**：真实 0.2.0-rc.2 宿主启动目标 profile → stderr 无 `dsh: disabling profile plugin row "<id>"`、无 `dsh: skipping profile bundle "dsh-user-approval-mode"`；chip 注册生效。
3. **L4 真实 GUI**：`style[data-plugin]` 出现、控制台无 `slot entry crashed`、chip 与"审批模式"设置页均渲染。
4. **L5 行为**：chip 切换模式走通 `/approval-mode`；设置页写入落到 profile `cordis.patch.yml` user 层并即时生效。
5. **L5 证伪实验**：故意把一条 peer 留成 `^0.1.7-rc.1` 启动一次，确认 L3 的**整包 skip** 信号真的出现；再改回。若留旧 peer 却观察不到任何信号，说明观测手段无效，必须换手段（不能默认"通过"）。
6. **`config-editor` `[未验证]` 项**（文档 §5.2）：`packages/boot/config-editor/src/index.ts` 的 `configuration()` 把 `inherited` 改走 `composed` 兜底。影响所有读插件配置的 Configure 卡片（本插件设置页、reject-policy、reme-support）。**未实测前保持 `[未验证]`，不得写成"已确认无影响"。**
7. **模型 ID**：`pi-ai` 0.85.1 → 0.87.1，rc.2 说明称移除部分旧 model ID ⇒ 已保存的模型选择可能需重选；本插件无 DSH 模型 ID 字面量（`model_name` 是 ReMe 服务端向量模型名），属部署侧数据问题。

---

## 八、环境发现（非发布内容，供后续排查）

1. **`.npmrc` 的 `store-dir` 在 pnpm 11 已失效**：`pnpm config get store-dir` → `undefined`，安装默认写 `~/.local/share/pnpm/store/v11`（只读挂载）并报 `ERR_PNPM_EROFS`。本轮通过 CLI 显式传 `--store-dir <repo>/.pnpm-store` 解决，**未改动被跟踪的 `.npmrc`**（其内容 `store-dir=.pnpm-store` 仍留在文件里，但 pnpm 11 不读；`prepare` 里由 npm 转发时还会打印 `npm warn Unknown project config "store-dir"`）。若要根治，应把该设置迁到 `pnpm-workspace.yaml` 的 `storeDir`，属独立小改动。
2. **pnpm 需确认清空 node_modules**：无 TTY 时会以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止；用 `--config.confirmModulesPurge=false` 解决。
3. `minimumReleaseAge` 当前**未设置**（`pnpm-workspace.yaml` 里的 `minimumReleaseAgeExclude` 是历史残留），本轮安装未触发该策略；若将来启用并拦新版本，把 15 个包 `@0.2.0-rc.x` 追加进该列表。
4. **registry 可达**（与舰队文档所述"npm 证据不可用"不同）：15 个消费包均有 `0.2.0-rc.1` / `0.2.0-rc.2`；`@deepseek-ai/dsh@0.2.0-rc.2` 已发布且为 `latest` ⇒ 下一轮装真实宿主可行。注意**单个** `@deepseek-ai/dsh-*` 包的 `dist-tags.latest` 仍是 `0.0.1-rc.1`、`next` 才是 `0.2.0-rc.2`，所以按范围（而非 tag）安装。

---

## 九、非目标 / 未验证 / 遗留

- 未发布、未打 tag、未合并 main；主机 checkout 与运行中 3080 宿主未升级。
- fleet 其余 5 仓（reject-policy、reme-auto-router、reme-support、more-agent-presets、tool-list-dir）未动；`want-a-init-fork` 跨两跳，单独排期。
- L2–L5 实机验证推迟（见第七节）；第六节的依赖残留需与 tool-list-dir 0.2.7 同批解决。**0.2.7 批次已执行**：下限抬到 `>=0.2.7`、删除 `dsh-system-prompt` override、lock 重解（`dsh-system-prompt` 全树 `0.2.0-rc.2`）；唯 `dsh-fs` 陈旧 cohort 仍在（pnpm 11.7 对 list-dir 0.2.7 的 peer 重选无效，`--force` 与全新重装均复现），待上游或 pnpm 行为变化后清理。
- 给舰队文档 `DSH-0.2.0-UPGRADE-PLAN.md` 的三条修正（该文档在本仓之外，需文档属主更新）：① §2.1 对本仓的失败模式应写"整包 skip"而非"禁用某一行"；② §2.1/§3 未提 `pnpm-workspace.yaml` 的 `dsh-system-prompt` override 与 `tool-list-dir@0.2.6` 的 0.1.7 era peers 会共同制造混合 cohort；③ §0.5/§2.1 的"src 零改动"对本仓成立，且本轮 registry 可用。

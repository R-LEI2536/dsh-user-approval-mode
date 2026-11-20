# TODO — 下次做

## smart 分类器：bash 与 run_code 用不同的 system prompt

**背景**（2026-11-20，分支 `run-code-gate` @ `c9050be`）：

smart 模式的 LLM 分类步骤目前对 bash 子调用和 run_code 顶层调用用的是**同一份**
system prompt（`DEFAULT_SMART_CLASSIFIER_PROMPT`，从 dsh-auto-approve 原样搬来，
通篇以 "the command" 指称被审对象）。两种调用只有 user message 里的证据 JSON 不同
（`toolName` + `command`，run_code 的 `command` 是整段 JS 程序文本）。

问题：

1. prompt 为 shell 命令而写，没有一句针对 JS 程序的说明，LLM 只能自己认出那是代码；
2. 该说的一句没说：**run_code 程序里被闸门看管的 `tools.*` 子调用之后会各自过闸**，
   LLM 实际裁的是子调用之外的部分（`import`、非 `tools` 的直连调用）。不说这句，
   LLM 会把整段程序当一个整体操作判断，可能对「程序里含一个会被单独拦的写操作」
   的程序过严（本该放行、让子调用自己弹）。

**方案方向**：按工具选 prompt——`bash` 继续用现 prompt；`run_code` 用一份新的
JS 版默认 prompt（说明：子调用已各自过闸、你裁的是程序里子调用之外的代码、
关切点仍是删除/密钥/外发/提权/混淆不可读）。

**实现落点**：

- `src/smart-prompt.ts` — 新增 `DEFAULT_SMART_RUN_CODE_PROMPT`（与现 prompt 同为
  部署方可覆盖面）。
- `src/smart-classifier.ts` — evaluator 按 `exec.name === 'run_code'` 选 prompt；
  注意 `buildEvidence` / LLM 调用处的 `system` 取值。
- `src/index.ts` — 配置语义要定：现有 `smartClassifierPrompt` 是单字符串覆盖。
  两个选择：(a) 该覆盖只作用于 bash，新增 `smartRunCodeClassifierPrompt` 覆盖
  JS 版；(b) 一个覆盖值同时拼两个。倾向 (a)，语义干净。
- 测试 — `test/smart-shell-evaluator.test.ts`：断言两种调用各自收到的 `system`
  正确；现有 harness 的 mock llm 需要能捕获 `options.system`。
- 文档 — README / README.zh（smart 分类器一节）、ADR 0004 修订段追加一句、
  CHANGELOG Unreleased。

**注意**：这是行为变化（改默认 prompt），发布说明里要写；部署方已有的
`smartClassifierPrompt` 覆盖在方案 (a) 下不受影响。

## 顺手项（同批可做）

- run_code 的 JS 版 prompt 里同时写明：识别不了/混淆的 JS 程序一律 ask（对齐
  "genuinely unreadable" 那条的语义）。
- 合并提醒：`main` @ `feae713`（smart 模型选择器）与 `run-code-gate` @ `c9050be`
  未合并（~11 处冲突，集中在 `ApprovalModeSettings.tsx` / `locales.ts` /
  `index.ts` / `smart-classifier.ts` / `smart-shell-evaluator.test.ts`），发布
  0.15.0 前必须先合。devweb（`dev_web` profile）当前 link 指向
  `.worktrees/smart-classifier-pickers`，合并后需重装/重指向才能测全部特性。

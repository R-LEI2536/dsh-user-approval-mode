# llm-workflows

LLM 协作工作流复盘目录。记录每次会话里**值得复用的工作模式**，便于以后面对同类任务时直接套用。

与 `docs/` 的区别：

- `docs/`：项目相关的**事实 / 决策 / 审计结论**（带日期 + 主题，如 `2026-09-09-dsh-v0-1-5-alpha-1-compatibility-audit.md`）
- `llm-workflows/`：**方法论 + 流程模板**（带日期 + 工作流名，如 `2026-09-09-dsh-upgrade-audit-workflow.md`）

## 命名约定

`YYYY-MM-DD-<workflow-name>.md`

例：`2026-09-09-dsh-upgrade-audit-workflow.md`

## 何时写

- 用户要求"总结一下我们这次的工作流 / 流程 / 模式"
- 一轮会话结束后发现某些步骤值得复用（grep 清单、错误处理模板、决策树等）
- 同类任务出现 ≥ 2 次，希望下次直接照模板做

## 何时不写

- 单次决策（→ 写 `docs/adr/000N-*.md`）
- 单次审计 / 兼容性评估（→ 写 `docs/YYYY-MM-DD-<topic>.md`）
- 跟具体代码改动绑定（→ 写到 commit message 或 PR description）

## 文件模板

每份复盘笔记建议覆盖：

1. **核心方法论**（步骤表 + 关键动作）
2. **关键决策与教训**（哪一步走错 / 被用户纠正 / 学到什么）
3. **下次直接套用的模板**（grep 清单 / 决策树 / checklist）
4. **本次产出物清单**（路径 + 性质 + 何时用）
5. **一句话总结**

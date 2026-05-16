# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-16

**当前阶段**：Phase 1.5 — 源码边界对齐

**上节课完成**：第 6A 课 — Command 系统（全部 5 个 Step + Tutorial 完成）

**本次路线复盘结论**：
- 不回退 Lesson 1-5。已完成代码是 Happy Path 学习资产，后续在上面迁移和补强。
- 暂缓 Plugin。Claude Code 的 Plugin 不是“任意 Tool 插件”，而是扩展组件包，主要贡献 commands / skills / agents / hooks / MCP / LSP / output-styles。
- Command 系统已补齐。Claude Code 里 Skill 更接近一种 prompt command，Plugin 也依赖 command/skill/agent 这些组件的统一加载。
- Context / System Prompt 需要提前。Agent 像不像 Claude Code，关键不只是工具循环，还包括 AGENTS/CLAUDE.md、cwd、git 状态、日期、memory 如何进入提示词。

**前 5 课保留现状**：
- Lesson 1：Agent Loop + Streaming API 已完成
- Lesson 2：Tool 系统 + 核心工具已完成
- Lesson 3：MCP HTTP Happy Path 已完成
- Lesson 4：Skill 独立系统已完成，后续迁移到 Command 模型
- Lesson 5：Subagent 系统已完成

**迁移策略**：
- 已实现 `src/commands/`，暂未改动现有 SkillTool。
- 下一步做 Context / System Prompt，再做 `skillToCommand()` 适配层。
- SkillTool 再从 CommandRegistry 里筛选 skill command，而不是直接依赖独立 Skill 列表。
- Plugin 最后接入 commands / skills / agents / MCP，不把“直接注册 Tool”作为主目标。

**第 6A 课完成内容**：
- 新增 `src/commands/`：PromptCommand 类型、CommandRegistry、内置命令、Markdown command loader、slash command 解析。
- CLI 支持 `/command args`：命中后展开成 command prompt，再进入现有 `query()`。
- 支持 `~/.mini-cc/commands/*.md`，frontmatter 字段包括 `description` / `arguments` / `allowed-tools`。
- 参数替换支持 `$ARGUMENTS`、`$ARGUMENTS[0]`、`$0`、`$name`、`${name}`。
- 教程已写入 `docs/reflections/lesson-6a-command-system.md`。

**关键源码参考**：
- `../claude-code/src/commands.ts` — Command 汇总入口
- `../claude-code/src/types/command.ts` — Command 类型
- `../claude-code/src/skills/loadSkillsDir.ts` — Skill 作为 command 的加载方式
- `../claude-code/packages/builtin-tools/src/tools/SkillTool/SkillTool.ts` — SkillTool 从 commands 中执行 prompt
- `../claude-code/src/utils/plugins/loadPluginCommands.ts` — Plugin command/skill loader
- `../claude-code/src/utils/plugins/refresh.ts` — Plugin active components refresh

**已更新文档**：
- `ROADMAP.md` — 改为迁移式路线，新增 Phase 1.5
- `STATUS.md` — Phase 1.5 标记 1/4 完成，第 6A 课完成
- `SESSION.md` — 当前手写交接改为 Context / System Prompt 计划

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 6B 课 — Context / System Prompt（`src/context.ts`）

- [x] Step 0：Runtime 生命周期重构 — 提取 `createRuntime()` / `runOnce()`，让初始化和单次执行分离
- [ ] Step 1：基础 system prompt — mini-cc 身份、工具使用原则、输出约束
- [ ] Step 2：项目上下文 — 读取 `AGENTS.md` / `CLAUDE.md`，注入 cwd、日期、平台
- [ ] Step 3：git 上下文 — branch/status/diff 摘要
- [ ] Step 4：query 接入 — systemContext / userContext 进入主 Agent 和子 Agent
- [ ] Step 5：写教程 `docs/reflections/lesson-6b-context-system-prompt.md`

**Step 0 设计草图**：

```text
main()
  ├─ createRuntime()
  │   ├─ load commands
  │   ├─ create tools
  │   ├─ load skills / agents
  │   ├─ discover MCP tools
  │   └─ finalize tools
  │
  ├─ readStdin()
  └─ runOnce(runtime, input)
      ├─ parse /command
      ├─ build messages
      └─ query(...)
```

**Step 0 边界**：
- 仍保持单次 CLI，不做 REPL / 命令候选弹窗
- 不改变现有 command/tool/MCP 行为，只调整生命周期位置
- `runOnce()` 先接收 `runtime + input`，后续 6B 再接入 `systemContext / userContext`
- 为后续多轮 REPL 预留结构，但本课不实现循环输入

**Step 0 完成记录**：
- 新增 `src/cli/runtime.ts`，导出 `createRuntime()` / `runOnce()`。
- `createRuntime()` 负责 commands、tools、skills、agents、MCP 发现与 `finalizeTools()`。
- `runOnce()` 负责 slash command 展开、构造 messages、调用 `query()`。
- `src/cli/index.ts` 瘦身为启动器：检查 key → createRuntime → readStdin → runOnce。

**本课边界**：
- 不做 Memory，留到第 9 课
- 不做 Auto-Compact，留到第 8 课
- 不做权限系统，留到第 12 课
- 不把 AGENTS.md 全量塞进每轮 tool_result，只作为 system/user context 输入

**参考源码**：
- `../claude-code/src/context.ts`
- `../claude-code/src/constants/prompts.ts`
- `../claude-code/src/utils/git.ts`
- `../claude-code/src/utils/messages.ts`

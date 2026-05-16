# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-16

**当前阶段**：Phase 1.5 — 源码边界对齐

**上节课完成**：第 6C 课 — Skill → Command 迁移（全部 5 个 Step + Tutorial 完成）

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
- 已实现 `src/commands/`，并完成 Context / System Prompt 接入。
- Skill loader 已直接返回 `Command[]`，不再保留独立 `Skill` 类型和 `skillToCommand()` 适配层。
- SkillTool 已改为从 CommandRegistry 里筛选 skill command，而不是直接依赖独立 Skill 列表。
- 下一步 Plugin 接入 commands / skills / agents / MCP，不把“直接注册 Tool”作为主目标。

**第 6A 课完成内容**：
- 新增 `src/commands/`：PromptCommand 类型、CommandRegistry、内置命令、Markdown command loader、slash command 解析。
- CLI 支持 `/command args`：命中后展开成 command prompt，再进入现有 `query()`。
- 支持 `~/.mini-cc/commands/*.md`，frontmatter 字段包括 `description` / `arguments` / `allowed-tools`。
- 参数替换支持 `$ARGUMENTS`、`$ARGUMENTS[0]`、`$0`、`$name`、`${name}`。
- 教程已写入 `docs/reflections/lesson-6a-command-system.md`。

**第 6B 课完成内容**：
- 新增 `src/context.ts`，构建基础 system prompt、项目指令、cwd/date/platform、git branch/status/diff stat。
- 新增并使用 `src/cli/runtime.ts` 的 `createRuntime()` / `runOnce()`，初始化先于单次输入执行。
- 主 Agent 调 `query()` 时传入 `runtime.systemPrompt`。
- AgentTool 启动子 Agent 时继承父级 system prompt，并追加子 Agent 自己的角色指令。
- 教程已写入 `docs/reflections/lesson-6b-context-system-prompt.md`。

**第 6C 课完成内容**：
- `src/skills/loader.ts` 现在直接把 `SKILL.md` 加载成 `PromptCommand`，贴近 claude-code 的 `createSkillCommand()` 思路。
- `Command` metadata 新增 `kind: 'skill'`、`whenToUse`、`context`，保留 Skill 发现信息。
- `createRuntime()` 现在把 `~/.mini-cc/skills/*/SKILL.md` 加载后注册进 `CommandRegistry`。
- `SkillTool` 不再持有独立 `Skill[]`，改为从 `CommandRegistry` 中筛选 `kind === 'skill'` 的 command。
- Skill 参数替换复用 `commands/arguments.ts`，`${CLAUDE_SKILL_DIR}` 在 command 展开阶段处理。
- 已删除过渡用的 `src/skills/types.ts` 和 `src/skills/command.ts`，不再兼容第 4 课的独立 Skill 运行时模型。
- 已跑 `npm run build` 和 `npx tsx` 烟测，确认 `/demo` 前缀兼容、参数替换、目录变量替换都正常。
- 教程已写入 `docs/reflections/lesson-6c-skill-command-migration.md`。

**关键源码参考**：
- `../claude-code/src/commands.ts` — Command 汇总入口
- `../claude-code/src/types/command.ts` — Command 类型
- `../claude-code/src/skills/loadSkillsDir.ts` — Skill 作为 command 的加载方式
- `../claude-code/packages/builtin-tools/src/tools/SkillTool/SkillTool.ts` — SkillTool 从 commands 中执行 prompt
- `../claude-code/src/utils/plugins/loadPluginCommands.ts` — Plugin command/skill loader
- `../claude-code/src/utils/plugins/refresh.ts` — Plugin active components refresh

**已更新文档**：
- `ROADMAP.md` — 改为迁移式路线，新增 Phase 1.5
- `STATUS.md` — Phase 1.5 标记 3/4 完成，第 6C 课完成
- `SESSION.md` — 当前手写交接改为 Plugin 系统计划

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 7 课 — Plugin 系统（`services/plugins/`）

- [ ] Step 1：Plugin 发现 — 目录扫描 + manifest 解析
- [ ] Step 2：组件注册 — commands / skills / agents / hooks / MCP
- [ ] Step 3：Plugin 激活 + 隔离 — enabled/disabled + `pluginName:componentName` 命名空间
- [ ] Step 4：Plugin refresh — 重新加载组件，不重启主 Agent
- [ ] Step 5：写教程 `docs/reflections/lesson-7-plugin-system.md`

**本课边界**：
- Plugin 不是“直接注册任意 Tool”的主入口，先聚焦组件包
- 先支持本地目录发现，不做 marketplace / remote install
- hooks / MCP 先做 manifest 和注册边界，复杂权限和 stdio 生命周期留给后续课
- 命名空间要避免用户 command / skill / agent 被 plugin 静默覆盖

**参考源码**：
- `../claude-code/src/commands.ts`
- `../claude-code/src/utils/plugins/loadPluginCommands.ts`
- `../claude-code/src/utils/plugins/refresh.ts`
- `../claude-code/src/utils/plugins/pluginManager.ts`

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
- 下一步先补第 6D 课，再进入 Plugin。原因是 Plugin 会动态增加 skills / agents；如果 SkillTool / AgentTool 仍把完整列表塞进 description，插件刷新会扰动工具 schema，真实运行效果和 prompt cache 都会变差。

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
- `../claude-code/packages/builtin-tools/src/tools/SkillTool/prompt.ts` — SkillTool 静态 prompt + skill listing 预算 / 截断
- `../claude-code/packages/builtin-tools/src/tools/AgentTool/prompt.ts` — AgentTool 静态 prompt + agent listing attachment 开关
- `../claude-code/src/utils/attachments.ts` — `skill_listing` / `agent_listing_delta` 动态注入
- `../claude-code/packages/builtin-tools/src/tools/AgentTool/loadAgentsDir.ts` — built-in / plugin / user / project agent 合并与覆盖
- `../claude-code/src/utils/plugins/loadPluginCommands.ts` — Plugin command/skill loader
- `../claude-code/src/utils/plugins/refresh.ts` — Plugin active components refresh

**已更新文档**：
- `ROADMAP.md` — 改为迁移式路线，新增 Phase 1.5
- `STATUS.md` — Phase 1.5 调整为 3/5 完成，新增第 6D 课
- `SESSION.md` — 当前手写交接和今日计划改为第 6D 课

**第 6D 课新增原因**：
- 当前 `src/services/tools/skill.ts` 和 `src/services/tools/agent.ts` 都把可用列表直接拼进 tool description。
- Claude Code 现在倾向让 tool prompt 保持稳定：SkillTool description 只随输入变化，prompt 只说明调用方式；skill 列表通过 `skill_listing` 注入，并按 1% context window 做预算。
- AgentTool 也有 `agent_listing_delta` 机制，把动态 agent 列表移出 description；列表会按 MCP 可用性、permission deny、allowedAgentTypes 过滤后再注入。
- mini-cc 先实现简化版 system-reminder 注入，不急着做完整 attachment/delta，但要把边界拆出来。

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 6D 课 — Discovery Prompt / Listing 注入（`SkillTool` + `AgentTool`）

- [ ] Step 1：源码对照 — 梳理 Claude Code 如何处理 skill listing / agent listing，明确 description 与动态列表的边界
- [ ] Step 2：Skill listing — SkillTool description 稳定化，skill 列表改为 system-reminder 注入，并实现预算 / 单条截断
- [ ] Step 3：Agent listing — AgentTool description 稳定化，agent 列表改为 system-reminder 注入，并展示有效工具范围
- [ ] Step 4：子 Agent 继承 — 子 Agent 只接收自己可用的 skill / agent listing，避免暴露不可调用能力
- [ ] Step 5：写教程 `docs/reflections/lesson-6d-discovery-listing.md`

**本课边界**：
- 不实现完整 attachment 协议，先用 system-reminder 注入模拟官方 `skill_listing` / `agent_listing_delta`
- 不做 skill search / remote skill discovery，只处理本地 command registry 中已加载的 skill
- 不做 background / fork subagent，只保证现有 sync subagent 的 listing 与实际工具权限一致
- 不做真实 prompt cache API，但代码结构要让 tool description 稳定，为后续 cache_control 留位置

**参考源码**：
- `../claude-code/src/commands.ts`
- `../claude-code/packages/builtin-tools/src/tools/SkillTool/prompt.ts`
- `../claude-code/packages/builtin-tools/src/tools/SkillTool/SkillTool.ts`
- `../claude-code/packages/builtin-tools/src/tools/AgentTool/prompt.ts`
- `../claude-code/src/utils/attachments.ts`
- `../claude-code/packages/builtin-tools/src/tools/AgentTool/loadAgentsDir.ts`

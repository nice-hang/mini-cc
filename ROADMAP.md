# mini-cc 三阶段学习路径

> 目标：从零实现一个类 Claude Code 的 AI 编程 Agent，理解 Agent 工程化的核心设计模式。
> 当前采用“迁移式路线”：保留已完成的 Lesson 1-5，不回退代码；后续用补课和小重构把实现逐步贴近 Claude Code 的真实抽象边界。

## 路线调整原则

已完成的代码是学习资产，不是负担。前 5 课已经跑通了 Agent Loop、Tool、MCP、Skill、Subagent 的最小闭环，后续不推倒重写，而是在现有闭环上补齐 Claude Code 源码里更真实的中间层。

本次调整后的核心判断：

- **Command 是缺失的中间层**：Claude Code 里 Skill 更接近一种 prompt command，Plugin 也主要贡献 commands / skills / agents / hooks / MCP，而不是直接贡献任意 TypeScript Tool。
- **Context 要提前**：Agent 像不像 Claude Code，不只取决于能不能调工具，还取决于 system prompt、项目上下文、AGENTS/CLAUDE.md、git 状态、memory 如何进入消息。
- **Plugin 要重新定位**：Plugin 是扩展组件包，不是“万能 Tool 插件”。mini-cc 的 Plugin 课应聚焦组件发现、启用、命名空间、刷新。
- **MCP 当前实现是 HTTP Happy Path**：ROADMAP 不再声称已实现 stdio transport。stdio / subprocess 生命周期放到后续增强。

```
当前状态：
  Lesson 1-5 已完成
    Agent Loop → Tool → MCP(HTTP) → Skill(独立模型) → Subagent

接下来：
  Lesson 6A  Command 系统补课
  Lesson 6B  Context / System Prompt 补课
  Lesson 6C  Skill 迁移到 Command 模型
  Lesson 7   Plugin 系统：注册 commands / skills / agents / hooks / MCP
  Lesson 8+  Compact / Memory / History / Retry / Permission / Integration
```

---

## Phase 1：能力骨架（MVP）

### 第 1 课：Agent Harness（已完成）

**本质**：Agent 就是 while(true) 循环：发消息 → 拿响应 → 执行工具 → 再发消息。

**实现模块**：`src/query/query.ts` + `src/services/api/claude.ts`

**核心模式**：
- 最小 Agent Loop
- 消息管理
- 流式 API
- CLI 单次运行入口

**Claude Code 参考**：
- `../claude-code/src/query.ts`
- `../claude-code/src/services/api/claude.ts`
- `../claude-code/src/utils/messages.ts`

---

### 第 2 课：Tool 系统（已完成）

**本质**：Tool 是 Agent 和世界的接口。模型只看到 schema，Harness 负责执行和编排。

**实现模块**：`src/Tool.ts` + `src/tools.ts` + `src/services/tools/`

**核心模式**：
- Tool 定义：name / description / input_schema / call
- ToolRegistry
- read/write/edit/bash/web 工具
- 并发安全分组执行

**后续补强**：
- 在 Permission 课前先加最小 permission hook 插槽，避免 bash/write/edit 长期裸奔。

**Claude Code 参考**：
- `../claude-code/src/Tool.ts`
- `../claude-code/src/tools.ts`
- `../claude-code/src/services/tools/StreamingToolExecutor.ts`
- `../claude-code/src/services/tools/toolOrchestration.ts`

---

### 第 3 课：MCP 协议（已完成 HTTP Happy Path）

**本质**：MCP 是外部工具接入协议。Agent 不关心工具来自内置还是外部服务器。

**实现模块**：`src/services/mcp/`

**当前实现**：
- HTTP JSON-RPC client
- initialize / tools/list / tools/call
- MCP 工具转 mini-cc Tool
- `mcp__server__tool` 命名空间

**后续补强**：
- stdio transport
- subprocess 生命周期
- MCP 连接管理和重连

**Claude Code 参考**：
- `../claude-code/packages/mcp-client/src/`
- `../claude-code/src/services/mcp/`

---

### 第 4 课：Skill 系统（已完成，后续迁移）

**本质**：Skill 是按需加载的专家指令。模型先看摘要，需要时再读取全文。

**实现模块**：`src/skills/` + `src/services/tools/skill.ts`

**当前实现**：
- `~/.mini-cc/skills/*/SKILL.md`
- frontmatter 解析
- SkillTool description 暴露列表
- call 时返回完整指令和变量替换
- allowed-tools 作为软约束

**需要修正的认知**：
Claude Code 里 SkillTool 主要从 Command 列表中选择 prompt command。mini-cc 现有 Skill 可以保留，但后续应迁移为 Command 的一种来源，而不是长期独立于 Command 系统。

**Claude Code 参考**：
- `../claude-code/src/skills/loadSkillsDir.ts`
- `../claude-code/packages/builtin-tools/src/tools/SkillTool/SkillTool.ts`
- `../claude-code/src/commands.ts`

---

### 第 5 课：Subagent 系统（已完成）

**本质**：Subagent 是在 Tool 调用里启动另一个 Agent Loop。父 Agent 负责分解，子 Agent 负责执行。

**实现模块**：`src/coordinator/` + `src/services/tools/agent.ts`

**当前实现**：
- AgentTool
- 内置 general / explore / plan
- 工具过滤
- Sync 模式
- 防递归

**后续补强**：
- 子 Agent 继承 Context
- 自定义 Agent 走 Command/Plugin 统一加载
- 可选 worktree / async 模式作为高级课，不进入当前主线

**Claude Code 参考**：
- `../claude-code/packages/builtin-tools/src/tools/AgentTool/`
- `../claude-code/src/coordinator/`

---

## Phase 1.5：对齐 Claude Code 抽象边界

> 这是本次路线调整新增的过渡阶段。它不推翻前 5 课，而是补齐前面为了 Happy Path 暂时跳过的关键层。

### 第 6A 课：Command 系统（已完成）

**本质**：Command 是“用户或模型可触发的 prompt/action 单元”。Slash command、Skill、Plugin command 都可以落到这个统一结构上。

**实现模块**：`src/commands/`

**实现范围**：
- `Command` 类型：name / description / source / allowedTools / getPromptForCommand
- CommandRegistry
- Markdown command loader：`~/.mini-cc/commands/*.md`
- CLI 中识别 `/command args`
- Prompt command 输出用户消息，进入现有 query loop

**暂不做**：
- 复杂 UI command
- shell frontmatter
- command hooks
- remote / MCP prompt command

**Claude Code 参考**：
- `../claude-code/src/commands.ts`
- `../claude-code/src/types/command.ts`
- `../claude-code/src/utils/plugins/loadPluginCommands.ts`
- `../claude-code/src/skills/loadSkillsDir.ts`

---

### 第 6B 课：Context / System Prompt

**本质**：Context 是 Agent 看世界的方式。工具给 Agent 手，Context 给 Agent 眼睛和记忆。

**计划模块**：`src/context.ts` 或 `src/context/`

**实现范围**：
- 先重构 CLI 生命周期：`createRuntime()` 初始化 command/tool/skill/agent/MCP，`runOnce()` 处理一次用户输入
- 构建基础 system prompt
- 读取项目 `AGENTS.md` / `CLAUDE.md`
- 注入 cwd、日期、平台、git branch/status
- 为 query 增加 systemContext / userContext 入口
- 子 Agent 继承上下文

**暂不做**：
- REPL / TUI / slash command 候选弹窗
- Prompt caching
- 大型上下文裁剪
- 多级 settings / managed policy

**Claude Code 参考**：
- `../claude-code/src/context.ts`
- `../claude-code/src/constants/prompts.ts`
- `../claude-code/src/utils/systemPrompt.ts`
- `../claude-code/docs/context/system-prompt.mdx`

---

### 第 6C 课：Skill 迁移到 Command 模型

**本质**：把现有 Skill 实现从“独立系统”调整为“Command 的一种来源”，贴近 Claude Code。

**迁移策略**：
- 保留 `src/skills/loader.ts` 的 SKILL.md 解析能力
- 新增 `skillToCommand()` 适配层
- SkillTool 改为从 CommandRegistry 中筛选 `kind === 'skill'`
- 兼容现有 `~/.mini-cc/skills/*/SKILL.md`
- Tutorial 解释为什么官方把 Skill 和 Command 放得很近

**不需要做的事**：
- 不删除现有 Skill 文件
- 不重写前 4 课教程，只追加“对照修正”说明

---

### 第 7 课：Plugin 系统

**本质**：Plugin 是扩展组件包，不是单纯的 Tool 插件。它把 commands / skills / agents / hooks / MCP 等组件一起安装、启用、刷新。

**计划模块**：`src/services/plugins/`

**实现范围**：
- `.mini-cc-plugin/plugin.json` 或 `.claude-plugin/plugin.json` manifest 解析
- 本地 plugin 目录扫描
- enabled / disabled 状态
- 注册 plugin commands
- 注册 plugin skills
- 注册 plugin agents
- 读取 plugin MCP server 配置
- 命名空间：`pluginName:componentName`

**暂不做**：
- marketplace
- git clone / zip cache
- LSP
- hooks 执行引擎（先只解析和挂载）
- Plugin 直接贡献 TypeScript Tool

**Claude Code 参考**：
- `../claude-code/src/types/plugin.ts`
- `../claude-code/src/utils/plugins/pluginLoader.ts`
- `../claude-code/src/utils/plugins/loadPluginCommands.ts`
- `../claude-code/src/utils/plugins/refresh.ts`
- `../claude-code/src/plugins/builtinPlugins.ts`

---

## Phase 2：上下文管理

### 第 8 课：上下文压缩（Auto-Compact）

**本质**：上下文窗口是有限资源。压缩不是删历史，而是把旧轨迹转成摘要后继续推理。

**计划模块**：`src/services/compact/`

**实现范围**：
- 粗略 token 估算
- compact threshold
- LLM summary compact
- compact boundary message
- 连续失败熔断

**Claude Code 参考**：
- `../claude-code/src/services/compact/autoCompact.ts`
- `../claude-code/src/services/compact/compact.ts`
- `../claude-code/src/services/compact/snipCompact.ts`

---

### 第 9 课：Memory 系统

**本质**：Memory 是文件化的长期上下文。模型擅长读写 Markdown，所以不用一开始就上向量数据库。

**计划模块**：`src/memdir/` + `src/services/extractMemories/`

**实现范围**：
- `~/.mini-cc/memory/*.md`
- 启动时注入相关 memory
- 每轮结束用受限 subagent 提取记忆
- 避免重复写

**Claude Code 参考**：
- `../claude-code/src/memdir/`
- `../claude-code/src/services/extractMemories/`
- `../claude-code/src/services/SessionMemory/`

---

### 第 10 课：会话持久化

**本质**：Session 是可恢复的对话轨迹。没有持久化，Agent 只能活在当前进程里。

**计划模块**：`src/history.ts` + `src/services/session/`

**实现范围**：
- 对话导出
- session 恢复
- transcript 文件
- 简单状态快照

**Claude Code 参考**：
- `../claude-code/src/history.ts`
- `../claude-code/src/assistant/sessionHistory.ts`
- `../claude-code/src/services/sessionTranscript/`

---

## Phase 3：Harness 稳定

### 第 11 课：错误恢复与重试

**本质**：生产级 Harness 的关键不是永不失败，而是失败后知道能不能恢复、怎么恢复。

**计划模块**：`src/services/api/withRetry.ts` + `src/services/api/errors.ts`

**实现范围**：
- 429 / 500 / 529 重试
- prompt-too-long 触发 compact 后重试
- fallback model
- 不可重试错误直接返回

**Claude Code 参考**：
- `../claude-code/src/services/api/withRetry.ts`
- `../claude-code/src/services/api/errors.ts`
- `../claude-code/src/query.ts`

---

### 第 12 课：Permission / Sandbox / 集成

**本质**：权限系统是工具执行层的安全边界，不是 prompt 里的礼貌提醒。

**计划模块**：`src/hooks/permissions/`

**实现范围**：
- allow / deny / ask
- permission mode：plan / default / acceptEdits / bypass
- bash/write/edit 的最小审批
- 后期补 classifier 和 auto-mode 断路器
- MCP 重连、孤儿进程清理、超大 tool_result 截断作为集成打磨

**Claude Code 参考**：
- `../claude-code/src/hooks/toolPermission/`
- `../claude-code/src/utils/permissions/`
- `../claude-code/docs/safety/permission-model.mdx`

---

## 每课交付物

每课完成标准不变：

- 实现 Happy Path
- 对照 Claude Code 源码修正一次
- 更新 `STATUS.md`
- 更新 `SESSION.md`
- 写教程到 `docs/reflections/lesson-N-name.md`
- 一课全部完成后再提交 git commit

| 课程 | 模块 | 状态 |
| --- | --- | --- |
| 1 | Agent Harness | 已完成 |
| 2 | Tool 系统 | 已完成 |
| 3 | MCP HTTP Happy Path | 已完成 |
| 4 | Skill 独立系统 | 已完成，后续迁移 |
| 5 | Subagent | 已完成 |
| 6A | Command 系统 | 已完成 |
| 6B | Context / System Prompt | 下一课 |
| 6C | Skill → Command 迁移 | 待做 |
| 7 | Plugin 系统 | 待做 |
| 8 | Auto-Compact | 待做 |
| 9 | Memory | 待做 |
| 10 | Session History | 待做 |
| 11 | Retry / Recovery | 待做 |
| 12 | Permission / Integration | 待做 |

# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-15

**当前阶段**：Phase 1 第 5 课 — Subagent 系统（全部完成）

**上节课完成**：第 5 课 — Subagent 系统（全部 3 个 Step + Tutorial 完成）

**关键决策**：
- AgentTool 使用 Sync 模式：子 Agent 在父 Agent 工具执行阶段同步运行，结果通过 tool_result 返回
- 防递归通过工具列表过滤实现（AgentTool 不进入子 Agent 的工具列表），而非提示词约束
- 工具过滤分两层：防递归（硬约束）+ 类型限制（白名单）
- 三种内置 Agent 类型：general（全工具）、explore（只读）、plan（读写无 bash）
- AgentTool 需要一个全局 allTools 引用，在全部工具注册完成后通过 `finalizeTools()` 设置
- runAgent 核心逻辑只有 40 行：filterTools → create messages → query() → collect text

**设计理由**：
- 函数式隔离：query() 接收全部参数、不依赖全局状态 → 子 Agent = 一次函数调用
- Tool 接口足够表达"启动一个 Agent" → 不引入新范式
- Sync 模式够简单，async 模式需要 task/notification 系统

**已完成**（Step 1 ~ Step 3 + Tutorial）：
- `src/coordinator/types.ts` — AgentDefinition 类型
- `src/coordinator/agents.ts` — 三种内置 Agent 定义
- `src/coordinator/toolFilter.ts` — 双层工具过滤
- `src/coordinator/runAgent.ts` — 子 Agent 执行器
- `src/services/tools/agent.ts` — AgentTool（Tool 包装）
- `src/tools.ts` — registerAgentTool + finalizeTools
- `src/cli/index.ts` — AgentTool 注册 + finalize
- `docs/reflections/lesson-5-subagent-system.md` — 教程

**尝试过但排除的方案**：
- Async 模式：需要 task 注册表和跨轮次消息通知，超出当前范围
- AbortController 独立管理：子 Agent 同步运行在工具执行阶段，父 Agent 的 AbortController 自然 cascade
- 文件系统加载自定义 Agent：只用硬编码的三种内置类型，够用

**下一步**：
第 6 课 — Plugin 系统（services/plugins/）：扫描目录 → manifest 解析 → 多子系统统一注册（Tool / Skill / Command / MCP）

**关键决策**：
- Skill 不走 system prompt 注入，改为 Skill Tool 的 description 字段暴露 — 零固定 token 开销，模型决定调 tool 时才读到技能列表
- Skill frontmatter 用纯 regex 解析，不引入 yaml 库
- Skill 目录固定为 `~/.mini-cc/skills/<name>/SKILL.md`
- 无 skill 时 Skill Tool 不注册，零开销
- Variable substitution: `${CLAUDE_SKILL_DIR}` → skill baseDir, `$ARGUMENTS` → args 参数, `${name}` → 命名参数
- Allowed-tools：**软约束方案** —— Skill Tool 的 description 中告知模型建议使用的工具（`[工具限制：...]`），不拦截实际调用。模型始终能看到全部工具。这与 claude-code 的 inline 模式一致（claude-code 用 `contextModifier` 改 `alwaysAllowRules` 做权限自动批准，不改工具可见性）
- `context` 字段（`'inline' | 'fork'`）已添加到 Skill 接口，fork 模式需等第 5 课 subagent 系统完成后实现

**设计理由（对比 system prompt 注入方案）**：
- System prompt 注入：有 skill 就固定占 token，信息与 Skill Tool 描述重复
- Skill Tool description：无 skill 零开销，单一数据源，模型主动发现（同 claude-code 设计）

**已完成**（Step 1 ~ Step 3）：
- `src/skills/types.ts` — Skill 接口定义（含 context 字段）
- `src/skills/loader.ts` — 目录扫描 + frontmatter 解析
- `src/services/tools/skill.ts` — Skill Tool（description 列表 + call 加载 + 变量替换）
- `src/skills/index.ts` — 公开 API
- `src/tools.ts` — 新增 `registerSkillTool()` 辅助函数
- `src/cli/index.ts` — 启动时加载 skills → 注册 Skill Tool
- `~/.mini-cc/skills/example/SKILL.md` — 示例 skill
- `CLAUDE.md` — 实现原则 3：以 claude-code 源码为准

**已废弃/撤回**：
- `src/query/query.ts` 中的 `activeSkillName` 追踪和工具列表过滤 — 与 claude-code 的 inline 模式不符（claude-code 不做硬过滤），已删除

**尝试过但排除的方案**：
- System prompt 注入技能列表 → Skill Tool description 更简洁，零固定 token 开销
- yaml 库解析 frontmatter → 纯 regex 就够了
- `injector.ts` → 已删除，不再需要

**下一步**：
第 5 课 — Subagent 系统：AgentTool 创建独立子 Agent

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 5 课 — Subagent 系统（`src/coordinator/`）

- [x] Step 1：AgentTool — 创建独立 Agent 实例（独立对话历史 + 独立工具集 + 独立 system prompt）
- [x] Step 2：工具过滤 — 按子 Agent 类型只给部分工具（explore 只读、plan 读+写、general 全开）
- [x] Step 3：Sync 模式 + 防递归 — 子 Agent 完整运行后返回结果，子 Agent 默认不能调 AgentTool
- [x] **Tutorial** → `docs/reflections/lesson-5-subagent-system.md`

**参考源码**：
- `deps/claude-code/packages/builtin-tools/src/tools/AgentTool/` — AgentTool 实现
- `deps/claude-code/src/coordinator/` — 协调器定义

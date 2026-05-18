# mini-cc 实现状态

> 最后更新：2026-05-18
> 规划详见 ROADMAP.md，当前课程计划详见 SESSION.md
> 每课拆分子步骤跟踪，支持跨 Session 渐进；**每课最后一步是写教程**。

## 阶段进度

```
Phase 1：能力骨架（MVP）──────────── [100%]  5 / 5 课
Phase 1.5：源码边界对齐 ─────────── [ 60%]  3 / 5 课
Phase 2：上下文管理 ──────────────── [  0%]  0 / 3 课
Phase 3：Harness 稳定 ───────────── [  0%]  0 / 2 课
```

### Phase 1：能力骨架（MVP）

#### 第 1 课 — Agent Harness（`query/` + `services/api/claude.ts`）

- [x] Step 1：最小 Agent 循环 — while(true) callModel → parseResponse → executeTools → loop
- [x] Step 2：消息管理 — 角色交替、tool_result 匹配 tool_use_id、相邻同角色合并
- [x] Step 3：流式 API — AsyncGenerator 产出 text_delta / tool_use / done 事件
- [x] Step 4：CLI 入口 — 单次模式（stdin → stdout）能跑通一轮对话
- [x] **Tutorial** → `docs/reflections/lesson-1-agent-harness.md`

#### 第 2 课 — Tool 系统（`Tool.ts` + `tools.ts` + `services/tools/`）

- [x] Step 1：Tool 定义规范 — JSON Schema、description、并发安全标记、中断行为
- [x] Step 2：Tool 注册中心 — name → Tool 的 Map，支持动态注册/注销
- [x] Step 3：核心工具集 — read_file / write_file / edit_file / bash / web_search / web_fetch
- [x] Step 4：并发分组执行 — partitionToolCalls() 安全并行 + 不安全串行
- [x] **Tutorial** → `docs/reflections/lesson-2-tool-system.md`

#### 第 3 课 — MCP 协议（`services/mcp/`）

- [x] Step 1：MCP Client — HTTP transport，实现 tools/list + tools/call
- [x] Step 2：工具池合并 — MCP 工具和内置工具合并（`mcp__` 前缀防重名）
- [x] Step 3：连接生命周期 — 启动连接 → 工具注册 → 使用 → 断开
- [x] **Tutorial** → `docs/reflections/lesson-3-mcp-protocol.md`

#### 第 4 课 — Skill 系统（`skills/`）

- [x] Step 1：Skill 发现 — 目录扫描 + frontmatter 解析
- [x] Step 2：Skill Tool — tool description 曝露 skill 列表，call 返回完整指令（含变量替换）
- [x] Step 3：Skill 限制 — allowed-tools 作为软约束在 tool description 中告知模型（inline 模式）；添加 context 字段预留 fork 执行模式
- [x] **Tutorial** → `docs/reflections/lesson-4-skill-system.md`

#### 第 5 课 — Subagent 系统（`coordinator/`）

- [x] Step 1：AgentTool — 创建独立 Agent 实例（独立对话历史 + 独立工具集 + 独立 system prompt）
- [x] Step 2：工具过滤 — 按子 Agent 类型只给部分工具（explore 只读、plan 读+写、general 全开）
- [x] Step 3：Sync 模式 + 防递归 — 子 Agent 完整运行后返回结果，子 Agent 默认不能调 AgentTool
- [x] **Tutorial** → `docs/reflections/lesson-5-subagent-system.md`

### Phase 1.5：源码边界对齐

> 不回退 Lesson 1-5，在现有代码上补齐 Claude Code 源码里的中间层。

#### 第 6A 课 — Command 系统（`commands/`）

- [x] Step 1：Command 类型 — prompt command 的 name / description / source / allowedTools / getPromptForCommand
- [x] Step 2：CommandRegistry — 内置命令 + 文件命令统一注册
- [x] Step 3：Markdown command loader — `~/.mini-cc/commands/*.md` frontmatter + 变量替换
- [x] Step 4：CLI 调用 — 识别 `/command args`，把 command prompt 注入现有 query loop
- [x] **Tutorial** → `docs/reflections/lesson-6a-command-system.md`

#### 第 6B 课 — Context / System Prompt（`context.ts`）

- [x] Step 0：Runtime 生命周期重构 — 提取 `createRuntime()` / `runOnce()`，让 command/tool/skill/agent/MCP 初始化先于单次输入执行
- [x] Step 1：基础 system prompt — mini-cc 身份、工具使用原则、输出约束
- [x] Step 2：项目上下文 — 读取 `AGENTS.md` / `CLAUDE.md`，注入 cwd、日期、平台
- [x] Step 3：git 上下文 — branch/status/diff 摘要
- [x] Step 4：query 接入 — systemContext / userContext 进入主 Agent 和子 Agent
- [x] **Tutorial** → `docs/reflections/lesson-6b-context-system-prompt.md`

#### 第 6C 课 — Skill → Command 迁移（`skills/` + `commands/`）

- [x] Step 1：Skill loader 直接返回 `Command[]`，不保留独立 Skill 类型
- [x] Step 2：SkillTool 改造 — 从 CommandRegistry 中筛选 skill command
- [x] Step 3：兼容现有目录 — `~/.mini-cc/skills/*/SKILL.md` 不破坏
- [x] Step 4：对照修正 — 教程补充 Claude Code 中 Skill 与 Command 的关系
- [x] **Tutorial** → `docs/reflections/lesson-6c-skill-command-migration.md`

#### 第 6D 课 — Discovery Prompt / Listing 注入（`SkillTool` + `AgentTool`）

- [ ] Step 1：源码对照 — 梳理 Claude Code 如何处理 skill listing / agent listing，明确 description 与动态列表的边界
- [ ] Step 2：Skill listing — SkillTool description 稳定化，skill 列表改为 system-reminder 注入，并实现预算 / 单条截断
- [ ] Step 3：Agent listing — AgentTool description 稳定化，agent 列表改为 system-reminder 注入，并展示有效工具范围
- [ ] Step 4：子 Agent 继承 — 子 Agent 只接收自己可用的 skill / agent listing，避免暴露不可调用能力
- [ ] Step 5：对照修正 — 为 Plugin refresh 预留 delta attachment 边界
- [ ] **Tutorial** → `docs/reflections/lesson-6d-discovery-listing.md`

#### 第 7 课 — Plugin 系统（`services/plugins/`）

- [ ] Step 1：Plugin 发现 — 目录扫描 + manifest 解析
- [ ] Step 2：组件注册 — commands / skills / agents / hooks / MCP
- [ ] Step 3：Plugin 激活 + 隔离 — enabled/disabled + `pluginName:componentName` 命名空间
- [ ] Step 4：Plugin refresh — 重新加载组件，不重启主 Agent
- [ ] **Tutorial** → `docs/reflections/lesson-7-plugin-system.md`

### Phase 2：上下文管理

#### 第 8 课 — 上下文压缩（`services/compact/`）

- [ ] Step 1：Token 估算 — 按模型 tokenizer 估算当前上下文用量
- [ ] Step 2：触发阈值 — contextWindow - buffer，窗口越大 buffer 越大
- [ ] Step 3：Auto-Compact — LLM 压缩旧消息 → 摘要替换 → 递归锁防止自触
- [ ] Step 4：Snip Compact + 熔断器 — 裁掉窗口外历史 + 连续 3 次失败后永久跳过
- [ ] **Tutorial** → `docs/reflections/lesson-8-auto-compact.md`

#### 第 9 课 — Memory 系统（`memdir/` + `services/extractMemories/`）

- [ ] Step 1：Memory 目录 — `~/.mini-cc/memory/*.md` 纯文件存储
- [ ] Step 2：提取记忆 — 每轮结束 spawn 受限 subagent 写入文件
- [ ] Step 3：注入记忆 — 每次 query 开始时读所有 memory 文件注入 system prompt
- [ ] Step 4：去重保护 — 主 Agent 自己写了 → extractMemories 跳过
- [ ] **Tutorial** → `docs/reflections/lesson-9-memory-system.md`

#### 第 10 课 — 会话持久化（`history.ts`）

- [ ] Step 1：对话导出 — 当前消息列表序列化到文件
- [ ] Step 2：Session 恢复 — 从文件重建 Agent 状态
- [ ] Step 3：状态快照 — 定期保存 Agent 运行状态
- [ ] **Tutorial** → `docs/reflections/lesson-10-session-persistence.md`

### Phase 3：Harness 稳定

#### 第 11 课 — 错误恢复与重试（`services/api/withRetry.ts` + `errors.ts`）

- [ ] Step 1：重试决策树 — 429 退避 / 500 指数退避 / 401 刷新 / 413 压缩后重试
- [ ] Step 2：熔断器 + 模型降级 — 连续失败 N 次后跳过 / 主模型超载切备用
- [ ] Step 3：不可重试错误 + 后台不重试 — 400 直接抛 / extractMemories 失败直接放弃
- [ ] **Tutorial** → `docs/reflections/lesson-11-error-recovery.md`

#### 第 12 课 — Permission / 集成（`hooks/permissions/` + 跨系统）

- [ ] Step 1：三层决策 — allow（直接执行）/ deny（直接拒绝）/ ask（问用户）
- [ ] Step 2：投机分类器 + Permission 模式 — 异步分类 500ms 窗口 + plan/default 等模式
- [ ] Step 3：Auto-mode 断路器 — 超出信任边界 → 回退到 default 模式
- [ ] Step 4：集成打磨 — 孤儿清理 / MCP 重连 / 超大 tool_result 截断
- [ ] **Tutorial** → `docs/reflections/lesson-12-permission-integration.md`

## Design Log

| # | 日期 | 决策 | 原因 |
|---|------|------|------|
| 001 | 2026-05-11 | src/ 镜像 claude-code 架构，非按课号划分 | 代码结构反映架构本身，课程是时间线而非目录 |
| 002 | 2026-05-11 | 三层文件体系：CLAUDE.md → STATUS.md → SESSION.md | 渐进式披露，每次新会话只读 3 个文件即获完整上下文 |
| 003 | 2026-05-11 | SESSION.md 替代 HANDOFF.md + LESSON-PLAN.md | 合并手写交接与今日计划为单一活文档，消除信息散落 |
| 004 | 2026-05-11 | STATUS.md 拆子步骤跟踪 + 每课强制 Tutorial | 一课多 Session 时可见进度；课后产出教程沉淀设计思考 |
| 005 | 2026-05-11 | 编码规范：简洁 + 中文注释 + 贴合原版范式 | 第一次生成的代码太啰嗦、搬了太多定义；新规范要求一眼能看懂、不失去原理 |
| 006 | 2026-05-16 | 路线改为迁移式：保留 Lesson 1-5，新增 Command / Context / Skill 迁移 | 对照 Claude Code 后发现 Command 是 Skill 和 Plugin 的关键中间层，Plugin 不是任意 Tool 的主入口 |

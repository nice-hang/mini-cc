# mini-cc 实现状态

> 最后更新：2026-05-15
> 规划详见 ROADMAP.md，当前课程计划详见 SESSION.md
> 每课拆分子步骤跟踪，支持跨 Session 渐进；**每课最后一步是写教程**。

## 三阶段进度

```
Phase 1：能力骨架（MVP）──────────── [ 66%]  4 / 6 课
Phase 2：上下文管理 ──────────────── [  0%]  0 / 3 课
Phase 3：Harness 稳定 ───────────── [  0%]  0 / 3 课
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
- [x] Step 3：Skill 限制 — allowed-tools 定义 skill 只能调哪些工具
- [x] **Tutorial** → `docs/reflections/lesson-4-skill-system.md`

#### 第 5 课 — Subagent 系统（`coordinator/`）

- [ ] Step 1：AgentTool — 创建独立 Agent 实例（独立对话历史 + 独立 AbortController）
- [ ] Step 2：工具过滤 — 按子 Agent 类型只给部分工具（explore 只读、plan 读+写、general 全开）
- [ ] Step 3：Sync 模式 + 防递归 — 子 Agent 完整运行后返回结果，子 Agent 默认不能调 AgentTool
- [ ] **Tutorial** → `docs/reflections/lesson-5-subagent-system.md`

#### 第 6 课 — Plugin 系统（`services/plugins/`）

- [ ] Step 1：Plugin 发现 — 目录扫描 + manifest 解析
- [ ] Step 2：多子系统注册 — Tool / Skill / Command / MCP 统一注册入口
- [ ] Step 3：Plugin 激活 + 隔离 — 加载 → 注册 → 连接 → 作用域命名
- [ ] **Tutorial** → `docs/reflections/lesson-6-plugin-system.md`

### Phase 2：上下文管理

#### 第 7 课 — 上下文压缩（`services/compact/`）

- [ ] Step 1：Token 估算 — 按模型 tokenizer 估算当前上下文用量
- [ ] Step 2：触发阈值 — contextWindow - buffer，窗口越大 buffer 越大
- [ ] Step 3：Auto-Compact — LLM 压缩旧消息 → 摘要替换 → 递归锁防止自触
- [ ] Step 4：Snip Compact + 熔断器 — 裁掉窗口外历史 + 连续 3 次失败后永久跳过
- [ ] **Tutorial** → `docs/reflections/lesson-7-auto-compact.md`

#### 第 8 课 — Memory 系统（`memdir/` + `services/extractMemories/`）

- [ ] Step 1：Memory 目录 — `~/.mini-cc/memory/*.md` 纯文件存储
- [ ] Step 2：提取记忆 — 每轮结束 spawn 受限 subagent 写入文件
- [ ] Step 3：注入记忆 — 每次 query 开始时读所有 memory 文件注入 system prompt
- [ ] Step 4：去重保护 — 主 Agent 自己写了 → extractMemories 跳过
- [ ] **Tutorial** → `docs/reflections/lesson-8-memory-system.md`

#### 第 9 课 — 会话持久化（`history.ts`）

- [ ] Step 1：对话导出 — 当前消息列表序列化到文件
- [ ] Step 2：Session 恢复 — 从文件重建 Agent 状态
- [ ] Step 3：状态快照 — 定期保存 Agent 运行状态
- [ ] **Tutorial** → `docs/reflections/lesson-9-session-persistence.md`

### Phase 3：Harness 稳定

#### 第 10 课 — 错误恢复与重试（`services/api/withRetry.ts` + `errors.ts`）

- [ ] Step 1：重试决策树 — 429 退避 / 500 指数退避 / 401 刷新 / 413 压缩后重试
- [ ] Step 2：熔断器 + 模型降级 — 连续失败 N 次后跳过 / 主模型超载切备用
- [ ] Step 3：不可重试错误 + 后台不重试 — 400 直接抛 / extractMemories 失败直接放弃
- [ ] **Tutorial** → `docs/reflections/lesson-10-error-recovery.md`

#### 第 11 课 — Permission 系统（`hooks/permissions/`）

- [ ] Step 1：三层决策 — allow（直接执行）/ deny（直接拒绝）/ ask（问用户）
- [ ] Step 2：投机分类器 + Permission 模式 — 异步分类 500ms 窗口 + plan/default 等模式
- [ ] Step 3：Auto-mode 断路器 — 超出信任边界 → 回退到 default 模式
- [ ] **Tutorial** → `docs/reflections/lesson-11-permission-system.md`

#### 第 12 课 — Harness 集成与打磨

- [ ] Step 1：孤儿清理 — 子 Agent 退出后清理其 spawn 的进程
- [ ] Step 2：MCP 重连 + 心跳 — 指数退避重连最多 5 次 + 长工具执行中保活
- [ ] Step 3：超大结果处理 — tool_result 超过预算时截断/摘要
- [ ] **Tutorial** → `docs/reflections/lesson-12-harness-integration.md`

## Design Log

| # | 日期 | 决策 | 原因 |
|---|------|------|------|
| 001 | 2026-05-11 | src/ 镜像 claude-code 架构，非按课号划分 | 代码结构反映架构本身，课程是时间线而非目录 |
| 002 | 2026-05-11 | 三层文件体系：CLAUDE.md → STATUS.md → SESSION.md | 渐进式披露，每次新会话只读 3 个文件即获完整上下文 |
| 003 | 2026-05-11 | SESSION.md 替代 HANDOFF.md + LESSON-PLAN.md | 合并手写交接与今日计划为单一活文档，消除信息散落 |
| 004 | 2026-05-11 | STATUS.md 拆子步骤跟踪 + 每课强制 Tutorial | 一课多 Session 时可见进度；课后产出教程沉淀设计思考 |
| 005 | 2026-05-11 | 编码规范：简洁 + 中文注释 + 贴合原版范式 | 第一次生成的代码太啰嗦、搬了太多定义；新规范要求一眼能看懂、不失去原理 |

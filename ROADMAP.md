# mini-cc 三阶段学习路径

> 目标：从零实现一个类 Claude Code 的 AI 编程 Agent，理解 Agent 工程化的核心设计模式。
> 三个阶段，逐层深入：先搭建能力骨架，再管理上下文，最后加固稳定性。

```
Phase 1: 能力骨架（MVP）
  用户可见的一切能力：Tool / MCP / Skill / Subagent / Plugin / Command
  → 产出：可用的 AI 编程助手，能读代码、写代码、调工具
  
Phase 2: 上下文管理
  让 Agent 记住对话、记住项目、自动压缩上下文
  → 产出：能处理长对话、跨会话记忆的 Agent
  
Phase 3: Harness 稳定
  错误恢复、权限控制、安全熔断
  → 产出：可靠、可自愈的生产级 Harness
```

---

## Phase 1：能力骨架（MVP）— 约 6 课

### 设计思想

这个阶段从"使用者看到什么"出发，实现一个可用 AI 编程 Agent 的所有基础能力。
每节课只实现**最基础的 Happy Path**，理解 claude-code 的设计原理，不求边界完整。

```
课程依赖关系：

第 1 课：Agent Loop ──────────────────────────── 基础，推动一切
     │
     ├──→ 第 2 课：Tool 系统 ──→ 第 3 课：MCP 协议
     │                              （工具池合并）
     ├──→ 第 4 课：Skill 系统（可独立）
     ├──→ 第 5 课：Subagent 系统（依赖 Tool 系统）
     └──→ 第 6 课：Plugin 系统（整合 Tool + MCP + Skill）
```

### 第 1 课：Agent Harness（核心循环 + 流式 API）

**本质**：Agent 就是 while(true) 循环——发消息 → 拿响应 → 执行工具 → 再发消息。

**src/query/query.ts + src/services/api/claude.ts**

- **最小 Loop**：`callModel() → parseResponse() → executeTools() → loop`
- **消息管理**：角色交替、tool_result 匹配 tool_use_id、相邻同角色合并
- **流式 API**：AsyncGenerator 事件流（text_delta / tool_use / done），支持并行工具提前执行
- **CLI 入口**：单次模式（stdin/stdout）和交互模式（REPL）

**产出**：一个自制的 Agent 循环 + 流式 API，能跑通一轮对话。

**claude-code 参考**：

- `src/query.ts` — queryLoop 核心
- `src/services/api/claude.ts` — Streaming API
- `src/utils/messages.ts` — 消息管理
- `src/main.tsx` — 入口编排

---

### 第 2 课：Tool 系统 + 核心工具

**本质**：Tool 是 Agent 和世界的接口。每种工具就是一个"API endpoint"，有 schema、有执行函数。

**src/Tool.ts + src/tools.ts + src/services/tools/**

- **Tool 定义规范**：JSON Schema 描述参数、description、并发安全标记、中断行为
- **Tool 注册中心**：name → Tool 的 Map，支持动态注册/注销
- **核心工具集**：read_file / write_file / edit_file / list_directory / bash / web_search / web_fetch
- **并发分组执行**：partitionToolCalls() — 并发安全的并行跑，非安全的串行，bash 报错取消同批

**产出**：一个可扩展的工具系统，支持并发/串行分组执行。

**claude-code 参考**：

- `src/Tool.ts` — Tool 类型定义
- `src/tools.ts` — assembleToolPool()
- `src/services/tools/StreamingToolExecutor.ts` — 流式并行执行

---

### 第 3 课：MCP 协议集成

**本质**：MCP 是"工具的 USB 协议"。外部服务器暴露工具，Agent 自动发现并合并到工具池。

**src/services/mcp/**

- **MCP Client**：支持 stdio transport，实现 tools/list + tools/call
- **工具池合并**：MCP 工具和内置工具合并成一个数组（加 `mcp_`_ 前缀防重名）
- **连接生命周期**：启动时连接 → 工具注册 → 对话中使用 → 结束时断开

**产出**：Agent 能用 MCP 协议连接外部工具服务器。

**claude-code 参考**：

- `packages/mcp-client/src/` — MCP 客户端库
- `src/services/mcp/` — MCP 集成
- `src/tools.ts` — assembleToolPool()

---

### 第 4 课：Skill 系统

**本质**：Skill = 按需加载的专家指令。Agent 先看标题，匹配了再加载全文——不浪费上下文。

**src/skills/**

- **Skill 发现**：`~/.mini-cc/skills/*/SKILL.md` 扫描 + frontmatter 解析
- **渐进注入**：system prompt 只注入 name + description，匹配后按需加载
- **Skill Tool**：Skill 工具返回处理后的指令（含 `${CLAUDE_SKILL_DIR}` 变量替换和 `$ARGUMENTS`）
- **Skill 限制**：allowed-tools 定义 skill 只能调哪些工具

**产出**：可扩展的 Skill 热加载系统，支持按需加载专家指令。

**claude-code 参考**：

- `src/skills/` — Skill 系统
- `packages/builtin-tools/src/tools/SkillTool/SkillTool.tsx`

---

### 第 5 课：Subagent 系统

**本质**：Subagent = 在工具调用里开一个新的 Agent 循环。父 Agent 分解问题，子 Agent 专注执行。

**src/coordinator/**

- **AgentTool**：创建一个新 Agent 实例（独立对话历史、独立 AbortController）
- **工具过滤**：按子 Agent 类型只给部分工具（explore 只读、plan 读+写、general 全开）
- **同步 Sync 模式**：子 Agent 完整运行后返回结果
- **防递归**：子 Agent 默认不能调 AgentTool

**产出**：Agent 能递归地派生子 Agent 执行子任务。

**claude-code 参考**：

- `packages/builtin-tools/src/tools/AgentTool/` — AgentTool 实现
- `src/coordinator/` — 协调器

---

### 第 6 课：Plugin 系统

**本质**：Plugin = 可以贡献多个子系统的一等公民。一个 Plugin = Tool + Skill + Command + MCP。

**src/services/plugins/**

- **Plugin 发现**：`~/.mini-cc/plugins/*/` 扫描 + manifest 解析
- **多子系统注册**：Tool / Skill / Command / MCP 统一注册入口
- **Plugin 激活**：加载 → 注册工具 → 连接 MCP → 注册命令
- **Plugin 隔离**：作用域命名（`plugin:{name}:{tool}`）

**产出**：可插拔的扩展系统，一个 Plugin 能贡献多种能力。

**claude-code 参考**：

- `src/plugins/` — Plugin 定义
- `src/services/plugins/` — Plugin 加载注册

---

## Phase 2：上下文管理 — 约 3 课

### 设计思想

Phase 1 实现了"能用"的 Agent，但对话一长模型就"变笨"了——上下文窗口是有限资源。
这个阶段解决：如何让 Agent 在长对话中保持清醒，在多会话间保持记忆。

### 第 7 课：上下文压缩（Auto-Compact）

**本质**：不是删掉旧消息，是让 LLM 总结旧消息，用摘要替换。窗口是有限的，压缩是必需的。

**src/services/compact/**

- **Token 估算**：按模型 tokenizer 估算当前上下文用量
- **触发阈值**：contextWindow - buffer，窗口越大 buffer 越大
- **Auto-Compact**：用 LLM 压缩旧消息 → 摘要替换 → 递归锁防止自触
- **Snip Compact**：直接裁掉窗口外的历史（不花钱）
- **熔断器**：连续 3 次 compact 失败后永久跳过

**claude-code 参考**：

- `src/services/compact/autoCompact.ts`
- `src/services/compact/compact.ts`
- `src/services/compact/reactiveCompact.ts`

### 第 8 课：Memory 系统

**本质**：Memory 不是向量数据库，是 Markdown 文件。模型用 FileRead/FileEdit 读写——模型天生就会。

**src/memdir/ + src/services/extractMemories/**

- **Memory 目录**：`~/.mini-cc/memory/*.md`，纯文件
- **提取记忆**：每轮结束 spawn 受限 subagent，分析最后 N 条消息，写入文件
- **注入记忆**：每次 query 开始时读所有 memory 文件，注入 system prompt
- **去重保护**：主 Agent 自己写了 → extractMemories 跳过，防 double write

**claude-code 参考**：

- `src/services/extractMemories/`
- `src/memdir/`
- `src/context.ts`

### 第 9 课：会话持久化

**本质**：Session 结束了，上下文不能丢。文件化的对话历史 + 跨 session 状态恢复。

**src/history.ts + docs/**

- **对话导出**：当前消息列表序列化到文件
- **Session 恢复**：从文件重建 Agent 状态
- **状态快照**：定期保存 Agent 运行状态（正在执行的工具、待处理的消息）

**claude-code 参考**：

- `src/history.ts` — 对话历史管理
- `src/services/session/` — Session 管理

---

## Phase 3：Harness 稳定 — 约 3 课

### 设计思想

前两阶段实现了"能跑"的 Agent，但这个阶段让它"能扛"——出错能自愈、危险操作能拦截、长时间运行不崩溃。

### 第 10 课：错误恢复与重试

**本质**：Harness 稳定的核心不是写得对，是失败了能自愈。

**src/services/api/withRetry.ts + src/services/api/errors.ts**

- **重试决策树**：429 → 退避重试、500 → 指数退避、401 → 刷新 token、413 → 压缩后重试
- **熔断器**：连续失败 N 次后跳过
- **模型降级**：主模型超载时切换到备用模型
- **不可重试错误**：400（参数错误）直接抛，不重试
- **后台任务不重试**：extractMemories 等后台调用失败直接放弃

**claude-code 参考**：

- `src/services/api/withRetry.ts`
- `src/services/api/errors.ts`
- `src/query.ts`

### 第 11 课：Permission 系统

**本质**：权限 = 模型能做什么。不是写在 prompt 里，是在工具调度层 enforce。

**src/hooks/permissions/**

- **三层决策**：allow（直接执行）/ deny（直接拒绝）/ ask（问用户）
- **投机分类器**：bash 命令异步分类，500ms 批准就不弹窗
- **Permission 模式**：plan / default / acceptEdits / dontAsk / bypassPermissions
- **Auto-mode 断路器**：超出信任边界 → 回退到 default 模式

**claude-code 参考**：

- `src/hooks/toolPermission/`
- `src/utils/permissions/`

### 第 12 课：Harness 集成与打磨

**本质**：把前 11 课整合成一个稳定的整体，处理跨系统的边缘情况。

**跨系统集成**

- **孤儿清理**：子 Agent 退出后清理其 spawn 的进程
- **MCP 重连**：指数退避重连，最多 5 次
- **心跳机制**：长时间工具执行中保持连接不超时
- **超大结果处理**：tool_result 超过预算时截断/摘要

---

## 总览

```
Phase 1：能力骨架（MVP）
  ┌────────────────────────────────────────────────────┐
  │  1. Agent Harness（query/ + services/api/）          │
  │  2. Tool 系统（Tool.ts + tools.ts + services/tools/）│
  │  3. MCP 协议集成（services/mcp/）                    │
  │  4. Skill 系统（skills/）                            │
  │  5. Subagent 系统（coordinator/）                    │
  │  6. Plugin 系统（services/plugins/）                 │
  └────────────────────────────────────────────────────┘
  产出：一个自己能跑的 AI 编程 Agent，能用工具、调 MCP、加载 Skill、派生子 Agent

Phase 2：上下文管理
  ┌────────────────────────────────────────────────────┐
  │  7. 上下文压缩（services/compact/）                  │
  │  8. Memory 系统（memdir/ + extractMemories/）        │
  │  9. 会话持久化（history.ts）                         │
  └────────────────────────────────────────────────────┘
  产出：能处理长对话、跨会话记住上下文

Phase 3：Harness 稳定
  ┌────────────────────────────────────────────────────┐
  │  10. 错误恢复与重试（services/api/withRetry.ts）      │
  │  11. Permission 系统（hooks/permissions/）            │
  │  12. Harness 集成与打磨（跨系统）                     │
  └────────────────────────────────────────────────────┘
  产出：可靠、自愈、可控的生产级 Harness
```

## 每课交付物


| #   | 课程            | src/ 模块                                    | 关键设计模式                          |
| --- | ------------- | ------------------------------------------ | ------------------------------- |
| 1   | Agent Harness | `query/` + `services/api/claude.ts`        | AsyncGenerator、事件流、消息契约         |
| 2   | Tool 系统       | `Tool.ts` + `tools.ts` + `services/tools/` | Tool schema、并发分组、级联取消           |
| 3   | MCP 协议        | `services/mcp/`                            | 协议适配、工具池合并、scope 命名             |
| 4   | Skill 系统      | `skills/`                                  | Frontmatter、渐进注入、按需加载           |
| 5   | Subagent      | `coordinator/`                             | 递归 Agent、工具过滤、上下文隔离             |
| 6   | Plugin        | `services/plugins/`                        | 多子系统注册、作用域隔离                    |
| 7   | Auto-Compact  | `services/compact/`                        | Token 预算、LLM 摘要、熔断器             |
| 8   | Memory        | `memdir/` + `services/extractMemories/`    | File-native、extract subagent、注入 |
| 9   | 会话持久化         | `history.ts`                               | 序列化、快照、状态恢复                     |
| 10  | 错误恢复          | `services/api/withRetry.ts` + `errors.ts`  | 重试决策树、降级、熔断                     |
| 11  | Permission    | `hooks/permissions/`                       | 三层决策、投机分类器、模式切换                 |
| 12  | 集成            | 跨系统                                        | 孤儿清理、重连、超大结果                    |



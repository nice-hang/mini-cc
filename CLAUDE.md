# mini-cc — 从零实现 Claude Code

## 项目定位

从 Claude Code 官方源码中提取核心设计模式，在 mini-cc 中渐进式实现每个机制。
目标是理解 Agent 工程化的本质——从 Agent Loop 到 Plugin 生态，每节课实现一个独立模块。

通过"先理解设计意图 → 亲手实现 → 对照官方源码修正"的方式学习。

## Session Startup Ritual

每次新 Coding Session 按以下顺序接续：

1. **读 CLAUDE.md**（本文件）— 项目身份 & 约定
2. **读 STATUS.md** — 当前进度 & 当前课程
3. **读 SESSION.md** — 手写交接 & 今日计划
4. 开始实现

> 三个文件职责完全正交：**CLAUDE.md** 讲"我是谁"，**STATUS.md** 讲"到哪了"，**SESSION.md** 讲"现在做什么"。

## 仓库结构

```
mini-cc/
│
├── CLAUDE.md                       ★ LEVEL 1 必读：项目身份 + 约定
├── STATUS.md                       ★ LEVEL 2 必读：当前进度
├── SESSION.md                      ★ LEVEL 3 必读：手写交接 + 今日计划
│
├── ROADMAP.md                      ★ 参考：12 课课程总纲（每课读一次）
├── HANDOFFS/                       ★ 归档：历史 Session 手写记录
│
├── src/                            实现代码（镜像 claude-code 架构）
│   ├── index.ts                    入口
│   ├── config.ts                   配置
│   │
│   ├── Tool.ts                     Tool 类型定义
│   ├── tools.ts                    工具池汇编
│   │
│   ├── query/                      Agent 主循环
│   │   ├── query.ts                while(true) 核心
│   │   ├── config.ts               Query 配置
│   │   └── tokenBudget.ts          Token 预算
│   │
│   ├── services/
│   │   ├── api/                    LLM API 层
│   │   │   ├── claude.ts           流式调用
│   │   │   ├── withRetry.ts        重试
│   │   │   └── errors.ts           错误类型
│   │   │
│   │   ├── tools/                  工具执行引擎
│   │   ├── mcp/                    MCP 协议
│   │   ├── compact/                上下文压缩
│   │   ├── extractMemories/        记忆提取
│   │   └── plugins/                Plugin 注册加载
│   │
│   ├── skills/                     Skill 系统
│   ├── memdir/                     记忆目录
│   ├── coordinator/                Subagent 协调
│   ├── hooks/                      权限系统
│   ├── cli/                        CLI 入口
│   ├── commands/                   命令系统
│   ├── history.ts                  会话历史
│   ├── utils/                      工具函数
│   └── constants/                  常量
│
├── deps/claude-code → ../../claude-code/   ◀ symlink
│
├── docs/
│   ├── architecture.md             架构总览
│   └── reflections/                每课学习笔记
│
├── JOURNAL/                        每日日志（给人看）
│
└── package.json
```

## 源码对照表

claude-code 官方源码位于同级 `../claude-code/`，通过 `deps/` symlink 访问。

| mini-cc 模块 | claude-code 参考 |
|---|---|
| `query/query.ts` | `deps/claude-code/src/query.ts` |
| `services/api/claude.ts` | `deps/claude-code/src/services/api/claude.ts` |
| `Tool.ts` | `deps/claude-code/src/Tool.ts` |
| `tools.ts` + `services/tools/` | `deps/claude-code/src/tools.ts` + `services/tools/` |
| `services/mcp/` | `deps/claude-code/packages/mcp-client/src/` |
| `skills/` | `deps/claude-code/src/skills/` |
| `coordinator/` | `deps/claude-code/src/coordinator/` |
| `services/compact/` | `deps/claude-code/src/services/compact/` |
| `memdir/` + `services/extractMemories/` | `deps/claude-code/src/memdir/` + `services/extractMemories/` |
| `services/plugins/` | `deps/claude-code/src/services/plugins/` |
| `services/api/withRetry.ts` | `deps/claude-code/src/services/api/withRetry.ts` |
| `hooks/permissions/` | `deps/claude-code/src/hooks/toolPermission/` |
| `utils/messages.ts` | `deps/claude-code/src/utils/messages.ts` |
| `history.ts` | `deps/claude-code/src/history.ts` |

## 课程 → 模块映射

课程是时间线，目录是架构图。每课实现一个独立模块：

```
课时   模块                                 本质
───   ──────────────────────────────────   ──────────────────────────
 1    query/ + services/api/claude.ts      Agent while(true) 循环 + 流式 API
 2    Tool.ts + tools.ts + services/tools/  Tool 系统：定义 → 注册 → 执行
 3    services/mcp/                         MCP 协议：外部工具发现与调用
 4    skills/                               Skill 系统：按需加载专家指令
 5    coordinator/                          Subagent 系统：递归 Agent
 6    services/plugins/                     Plugin 系统：多子系统注册
 7    services/compact/                     上下文压缩
 8    memdir/ + services/extractMemories/    Memory 系统
 9    history.ts + docs/                    Session 持久化
10    services/api/withRetry.ts             错误恢复与重试
11    hooks/permissions/                    权限系统
12    跨系统集成                             Harness 打磨
```

## 实现原则

1. **从本质出发** — 先理解这个模块解决什么根本问题，再动手
2. **Happy Path First** — 先跑通核心流程，再加边界处理（本质 5min → Happy Path 30min → 边界 30min）
3. **对照修正** — 实现后对比 claude-code 源码，看差异在哪
4. **每节课一个独立提交** — git commit 按课分割，方便回溯

## 跨 Session 工作流（渐进式披露）

```
课前准备:
  STATUS.md  → 对齐当前在学哪一课
  SESSION.md → 恢复上次 Session 上下文（卡在哪、试过什么、下一步）

课上:
  SESSION.md 的今日计划 → 确定本 Session 范围
  实现 → 对照 → 修正

课后:
  SESSION.md 更新"手写交接"部分（完成/卡住/尝试过的方案）
  JOURNAL/   写心得总结（给人看）
  完成课程 → 更新 STATUS.md + 归档旧 SESSION.md 到 HANDOFFS/
```

**关键思想**：信息是瀑布式的。CLAUDE.md（身份）→ STATUS.md（进度）→ SESSION.md（细节）。每个层级在需要时才往下钻，不一次性加载全部。

## 设计来源

mini-cc 的架构设计和实现顺序参考了以下文章：

- **[Seeing Like an Agent](https://claude.com/blog/seeing-like-an-agent)** — 渐进式披露、工具设计哲学、模型视角
- **[Prompt Caching is Everything](https://claude.com/blog/lessons-from-building-claude-code-prompt-caching-is-everything)** — 消除冗余、高效上下文管理
- **[Claude Managed Agents](https://claude.com/blog/claude-managed-agents)** — Harness 作为基础设施层
- **[Dive into Claude Code](https://github.com/VILA-Lab/Dive-into-Claude-Code)** — 架构逐层拆解

## Git 约定

- `feat: lesson N - <模块名>` — 完成某节课的核心实现
- `fix: ...` — 修复
- `docs: ...` — 文档/笔记
- `refactor: ...` — 重构

## 构建与运行

```bash
npm run dev    # 开发模式
npm start      # 同上
npm run build  # 编译
```

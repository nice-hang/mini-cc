# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-12

**当前阶段**：Phase 1 第 1 课 ✅ 完全完结（含 Tutorial）

**关键决策**：
- `onEvent` 回调替代 `AsyncGenerator` / `yield` — CLI 入口更简洁
- 双协议（Anthropic + OpenAI）在一个文件内用 `if/else` 分支，不搞抽象层
- DeepSeek `reasoning_content` 通过 `as unknown as Record<string, string>` 绕过类型检查

**已完成**：
- `src/Tool.ts` — Tool + ToolResult 类型
- `src/types/stream.ts` — StreamEvent 联合类型
- `src/utils/messages.ts` — normalizeMessages + buildToolResultMessage
- `src/services/api/claude.ts` — 双协议流式 API（Anthropic SDK + OpenAI 兼容）
- `src/query/query.ts` — Agent while(true) 循环 + 内置工具执行
- `src/cli/index.ts` — CLI 入口（stdin → Agent → stdout）
- `src/cli/readline.ts` — stdin 读取（TTY 提示 / 管道）
- `docs/reflections/lesson-1-agent-harness.md` — 教程

**尝试过但排除的方案**：
- AsyncGenerator + yield* → CLI 非 Generator 函数无法用，改回调
- SDK `ContentBlock` → 不兼容 `MessageParam.content`，改 `ContentBlockParam`
- 自定义 .env parser → dotenv 库更稳定

**卡住 / 待解决的问题**：
- 无

**下一步**：
开始第 2 课（Tool 系统）— `Tool.ts` + `tools.ts` + `services/tools/`

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 1 课 — Agent Harness（`src/query/` + `services/api/claude.ts`）

**今日目标**：

- [x] Step 1：最小 Agent 循环
  - 验收条件：实现 `query.ts` 中的 while(true) 循环
- [x] Step 2：消息管理
  - 验收条件：角色交替、tool_result 匹配、相邻同角色合并
- [x] Step 3：流式 API
  - 验收条件：AsyncGenerator 产出 text_delta / tool_use / done 事件
- [x] Step 4：CLI 入口
  - 验收条件：单次模式（stdin → stdout）能跑通一轮对话
- [ ] **Tutorial**
  - 验收条件：`docs/reflections/lesson-1-agent-harness.md` 完成

**参考源码**：
- `deps/claude-code/src/query.ts`
- `deps/claude-code/src/services/api/claude.ts`
- `deps/claude-code/src/utils/messages.ts`

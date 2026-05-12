# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-12

**当前阶段**：Phase 1 第 1 课 Steps 1-4 完成，Tutorial 待补

**子步骤进度**：

| Step | 状态 |
|------|------|
| 1. 最小 Agent 循环 | ✅ 完成 |
| 2. 消息管理 | ✅ 完成 |
| 3. 流式 API | ✅ 完成 |
| 4. CLI 入口 | ✅ 完成 |
| 5. Tutorial | ⬜ 待做 |

**已完成**：
- 第 1 课全部代码按新规范重写（简洁 + 中文注释 + 贴合原版）
  - `src/Tool.ts` — Tool 类型定义
  - `src/types/stream.ts` — StreamEvent 类型
  - `src/utils/messages.ts` — normalizeMessages + buildToolResultMessage
  - `src/services/api/claude.ts` — streamMessage AsyncGenerator
  - `src/query/query.ts` — Agent while(true) 循环 + 内置工具执行
  - `src/cli/index.ts` — CLI 入口（stdin → Agent → stdout）
  - `src/cli/readline.ts` — stdin 读取
- **核心设计模式**：
  - AsyncGenerator 事件流：text_delta / tool_use / done
  - yield* 转发实现 streamMessage → query 的事件传递
  - 流式累积 tool_use input JSON，content_block_stop 时 parse
  - 4 个内置工具（read_file / write_file / bash / web_fetch）
  - 手动迭代 Generator 模式（CLI 非 Generator 函数）
- TypeScript 编译 0 错误通过
- STATUS.md 更新 Steps 1-4 为已完成

**卡住 / 待解决的问题**：
- 暂无（代码编译通过，需要 API key 才能实际运行测试）

**尝试过但排除的方案**：
- 在 CLI 中用 `yield*` → 不行，main() 不是 Generator 函数，改用 `while(true) { await generator.next() }`
- 使用 SDK `ContentBlock` 作为返回类型 → 不兼容 `MessageParam.content`，改为用 `ContentBlockParam`

**下一步**：
1. 设置 `ANTHROPIC_API_KEY` 后运行 `echo "..." | npm run dev` 验证端到端流程
2. 写 Tutorial → `docs/reflections/lesson-1-agent-harness.md`
3. 开始第 2 课（Tool 系统）

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

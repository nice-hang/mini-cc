# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-11

**当前阶段**：Phase 1 未开始，第 1 课（Agent Harness）待启动

**已完成**：
- 仓库结构设计确定（镜像 claude-code 架构）
- CLAUDE.md + ROADMAP.md + STATUS.md 全面更新
- SESSION.md 替代 HANDOFF.md + LESSON-PLAN.md

**卡住 / 待解决的问题**：
- 暂无（项目尚未开始编码）

**尝试过但排除的方案**：
- 按课号划分 src/ 目录 → 不合适，改用镜像 claude-code 源码架构

**下一步**：
1. 创建 src/ 目录骨架
2. 开始第 1 课实现

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 1 课 — Agent Harness（`src/query/` + `services/api/claude.ts`）

**今日目标**：

- [ ] Step 1：最小 Agent 循环
  - 验收条件：实现 `query.ts` 中的 while(true) 循环，能调一次 API 并返回结果
  - 预计耗时：
- [ ] Step 2：消息管理
  - 验收条件：角色交替、tool_result 匹配、相邻同角色合并
  - 预计耗时：
- [ ] Step 3：流式 API
  - 验收条件：AsyncGenerator 产出 text_delta / tool_use / done 事件
  - 预计耗时：
- [ ] Step 4：CLI 入口
  - 验收条件：单次模式（stdin → stdout）能跑通一轮对话
  - 预计耗时：

**参考源码**：
- `deps/claude-code/src/query.ts`
- `deps/claude-code/src/services/api/claude.ts`
- `deps/claude-code/src/utils/messages.ts`

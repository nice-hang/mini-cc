# mini-cc 实现状态

> 最后更新：2026-05-11
> 规划详见 ROADMAP.md，当前课程计划详见 SESSION.md

## 三阶段进度

```
Phase 1：能力骨架（MVP）──────────── [  0%]  0 / 6 课
Phase 2：上下文管理 ──────────────── [  0%]  0 / 3 课
Phase 3：Harness 稳定 ───────────── [  0%]  0 / 3 课
```

### Phase 1：能力骨架（MVP）

- [ ] **第 1 课** — Agent Harness（`query/` + `services/api/claude.ts`）
- [ ] **第 2 课** — Tool 系统（`Tool.ts` + `tools.ts` + `services/tools/`）
- [ ] **第 3 课** — MCP 协议（`services/mcp/`）
- [ ] **第 4 课** — Skill 系统（`skills/`）
- [ ] **第 5 课** — Subagent 系统（`coordinator/`）
- [ ] **第 6 课** — Plugin 系统（`services/plugins/`）

### Phase 2：上下文管理

- [ ] **第 7 课** — 上下文压缩（`services/compact/`）
- [ ] **第 8 课** — Memory 系统（`memdir/` + `services/extractMemories/`）
- [ ] **第 9 课** — 会话持久化（`history.ts`）

### Phase 3：Harness 稳定

- [ ] **第 10 课** — 错误恢复与重试（`services/api/withRetry.ts`）
- [ ] **第 11 课** — Permission 系统（`hooks/permissions/`）
- [ ] **第 12 课** — Harness 集成与打磨（跨系统）

## Design Log

| # | 日期 | 决策 | 原因 |
|---|------|------|------|
| 001 | 2026-05-11 | src/ 镜像 claude-code 架构，非按课号划分 | 代码结构反映架构本身，课程是时间线而非目录 |
| 002 | 2026-05-11 | 三层文件体系：CLAUDE.md → STATUS.md → SESSION.md | 渐进式披露，每次新会话只读 3 个文件即获完整上下文 |
| 003 | 2026-05-11 | SESSION.md 替代 HANDOFF.md + LESSON-PLAN.md | 合并手写交接与今日计划为单一活文档，消除信息散落 |

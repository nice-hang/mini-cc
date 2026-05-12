# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-13

**当前阶段**：Phase 1 第 2 课 ✅ 完全完结（含 Tutorial）

**关键决策**：
- `buildTool()` 默认值模式 — 工具作者只需指定自己不同的行为（读文件标记 safe+cancel，其余全用默认 unsafe+block）
- `partitionToolCalls` 用"相邻 safe 合并"而非"所有 safe 合并" — 保持模型发出调用的原始顺序
- `Tool` 接口只保留核心字段（6 个），去掉 UI 渲染/权限/验证等 40+ 字段

**已完成**：
- `src/Tool.ts` — 增强接口（call, isConcurrencySafe, interruptBehavior, buildTool）
- `src/services/tools/registry.ts` — ToolRegistry（register/unregister/get/getAll）
- `src/services/tools/read_file.ts` — read_file 工具
- `src/services/tools/write_file.ts` — write_file 工具
- `src/services/tools/edit_file.ts` — edit_file 工具
- `src/services/tools/bash.ts` — bash 工具
- `src/services/tools/web_fetch.ts` — web_fetch 工具
- `src/services/tools/web_search.ts` — web_search 工具（DuckDuckGo HTML 解析）
- `src/services/tools/partition.ts` — partitionToolCalls + executeToolGroups
- `src/tools.ts` — createDefaultTools() 装配器
- `src/query/query.ts` — 移除硬编码 toolHandlers，改用分区执行
- `src/cli/index.ts` — 使用 createDefaultTools()
- `docs/reflections/lesson-2-tool-system.md` — 教程

**尝试过但排除的方案**：
- 无（实现与设计基本一致，没有走弯路的决策）

**卡住 / 待解决的问题**：
- 无

**下一步**：
开始第 3 课（MCP 协议）— `services/mcp/`

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 2 课 — Tool 系统（`Tool.ts` + `tools.ts` + `services/tools/`）

- [x] Step 1：Tool 定义规范 — JSON Schema、description、并发安全标记、中断行为
- [x] Step 2：Tool 注册中心 — name → Tool 的 Map，支持动态注册/注销
- [x] Step 3：核心工具集 — read_file / write_file / edit_file / bash / web_search / web_fetch
- [x] Step 4：并发分组执行 — partitionToolCalls() 安全并行 + 不安全串行
- [x] **Tutorial** → `docs/reflections/lesson-2-tool-system.md`

**参考源码**：
- `deps/claude-code/src/Tool.ts`
- `deps/claude-code/src/tools.ts`
- `deps/claude-code/src/services/tools/`

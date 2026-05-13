# 当前 Session

> 活文档：每次 Session 开始时读此恢复上下文，结束后更新"手写交接"部分。
> 旧 handoff 自动归档至 `HANDOFFS/` 目录。

---

## 手写交接

> 上次 Session 结束时更新的内容。下个 Session 最先读这里。

**最后更新**：2026-05-14

**当前阶段**：Phase 1 第 3 课 ✅ 完全完结（含 Tutorial）

**关键决策**：
- 不引入 `@modelcontextprotocol/sdk` 依赖，直接实现 JSON-RPC 2.0 over HTTP — 比 stdio 更简洁（无需子进程/缓冲区/pending Map），每个请求就是一次 fetch()
- MCP 工具合并到 ToolRegistry 时用 `mcp__serverName__toolName` 前缀，通过 `toMiniCCTool()` 适配器转换
- McpClient 是纯 HTTP 客户端，无持久连接，无需 disconnect 清理
- 相较 claude-code 的 stdio+SSE 多 transport 支持，mini-cc 只做 HTTP

**已完成**：
- `src/services/mcp/types.ts` — McpServerConfig（url + headers）
- `src/services/mcp/errors.ts` — McpError / McpConnectionError / McpToolCallError
- `src/services/mcp/client.ts` — McpClient 类（connect/initialize/listTools/callTool + toMiniCCTool 适配器 + fetch JSON-RPC）
- `src/services/mcp/index.ts` — 公开 API 导出
- `src/tools.ts` — 新增 `registerMcpTools()` 辅助函数
- `src/cli/index.ts` — MCP_SERVERS 环境变量（JSON 数组，HTTP URL）
- `docs/reflections/lesson-3-mcp-protocol.md` — 教程

**尝试过但排除的方案**：
- 引入 @modelcontextprotocol/sdk → 太重，mini-cc 只需 JSON-RPC 2.0 核心协议
- stdio transport → 改为 HTTP，无需子进程管理和流式缓冲区
- Manager + Discovery + Cache 分层 → 单服务器场景不需要

**卡住 / 待解决的问题**：
- 无

**下一步**：
开始第 4 课（Skill 系统）— `src/skills/`

**下一步**：
开始第 4 课（Skill 系统）— `src/skills/`

---

## 今日计划

> 当前 Session 要完成的内容。每完成一步就勾选。

**课程**：第 3 课 — MCP 协议（`services/mcp/`）

- [x] Step 1：MCP Client — stdio transport，实现 tools/list + tools/call
- [x] Step 2：工具池合并 — MCP 工具和内置工具合并（`mcp__` 前缀防重名）
- [x] Step 3：连接生命周期 — 启动连接 → 工具注册 → 使用 → 断开
- [x] **Tutorial** → `docs/reflections/lesson-3-mcp-protocol.md`

**参考源码**：
- `deps/claude-code/packages/mcp-client/src/`

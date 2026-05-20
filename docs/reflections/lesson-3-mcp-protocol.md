# 第 3 课：MCP 协议

> 本教程是 mini-cc 系列的第 3 篇，对应课程：ROADMAP.md 中的第 3 课。
> 代码实现见 `src/services/mcp/`，参考源码为 claude-code 的 `deps/claude-code/packages/mcp-client/src/`。

---

## 本质

> MCP（Model Context Protocol）是一种让 Agent 通过 JSON-RPC 2.0 协议发现和调用外部工具的标准。它解决了"Agent 的工具集怎么扩展"的问题——不修改 Agent 代码，就能接入任何实现了 MCP 协议的服务。

mini-cc 采用 **HTTP transport**，每个 JSON-RPC 请求是一次独立的 HTTP POST。为了先看清 MCP 的最小闭环，第 3 课只实现了 `tools/list` 和 `tools/call`：

```
Agent Loop ──→ ToolRegistry ──→ McpClient ──→ HTTP POST ──→ MCP Server
                                       │
                                  tools/list → 发现工具
                                  tools/call → 执行工具
```

但 Claude Code 的真实流程不是这条直线。更准确地说，MCP server 先进入“连接与能力发现层”，然后按能力类型分流到不同系统：

```
MCP config
  │
  ▼
connectToServer()
  │   建立 stdio / HTTP / SSE / SDK 连接，得到 server capabilities
  │
  ▼
getMcpToolsCommandsAndResources()
  │
  ├─ tools/list
  │    └─ fetchToolsForClient()
  │        └─ 转成 Tool：name = mcp__server__tool，保留 mcpInfo / inputSchema / permission / timeout
  │
  ├─ prompts/list
  │    └─ fetchCommandsForClient()
  │        └─ 转成 Command：进入 slash command / prompt command 系统
  │
  ├─ resources/list
  │    └─ fetchResourcesForClient()
  │        └─ 进入资源索引；需要时通过 ReadMcpResourceTool 或 @mention 读成 attachment
  │
  ├─ skill:// resources
  │    └─ fetchMcpSkillsForClient()
  │        └─ 转成 loadedFrom = "mcp" 的 skill command，进入 SkillTool discovery
  │
  └─ server instructions
       └─ mcp_instructions_delta attachment
           └─ 作为运行时上下文增量注入，而不是塞进 Tool description
```

所以 MCP 在 Claude Code 里不是“远程 Tool 的别名”，而是一个远程能力源。**只有 MCP tools 会被包装成 Tool；MCP prompts 进入 Command；MCP resources 进入 Attachment；MCP instructions 进入 delta 上下文。**

## 为什么需要它

没有 MCP 之前，要给 Agent 加一个新工具需要做三件事：

1. 按照 Agent 的 Tool 接口实现 `call()` 函数
2. 编译打包到 Agent 中
3. 如果需要动态加载，还得自己实现进程管理

这不灵活。MCP 的解法是：**工具是独立服务，通过标准协议通信**。Agent 只需要发 HTTP POST 请求，就能调用任何 MCP 服务器提供的工具。

## 设计意图

MCP 协议设计有几个核心考量：

- **Transport 无关**：底层通信（stdio / HTTP / SSE）对上层透明。mini-cc 选择 HTTP 因为实现最简单——`fetch()` 天然就是 JSON-RPC 的请求-响应配对。
- **工具命名隔离**：`mcp__serverName__toolName` 前缀防止不同 MCP 服务器的工具同名冲突。
- **无状态**：HTTP 的每个请求独立，不需要子进程管理、行缓冲区、pending 匹配表——比 stdio 少一个数量级的复杂度。

## 关键模式

### 模式 1：JSON-RPC 2.0 over HTTP

```typescript
// MCP over HTTP 的核心实现：一行 fetch() 替代 stdio 版的一堆基础设施
// stdio 版需要：child_process + 行缓冲区 + pending Map + 超时定时器 + 信号量清理
// HTTP 版只需要：fetch + JSON.parse

private async rawRequest(method: string, params: unknown): Promise<unknown> {
  const id = ++this.requestId
  const body = { jsonrpc: '2.0', id, method, params }

  const response = await fetch(this.url, {
    method: 'POST',
    headers: this.headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const json = await response.json() as JsonRpcResponse
  if (json.error) {
    throw new Error(`JSON-RPC error ${json.error.code}: ${json.error.message}`)
  }

  return json.result
}
```

**为什么这样设计？** HTTP 的请求-响应模型和 JSON-RPC 完美匹配——每个请求发出去，等一个响应回来。相比之下，stdio 是流式管道，需要手动按 id 匹配请求和响应。

### 模式 2：Tool 适配器

MCP 工具定义和 mini-cc 的 Tool 接口不同，需要一个适配层：

```typescript
toMiniCCTool(mcpTool: McpToolDefinition, serverName: string) {
  const prefixedName = `mcp__${serverName}__${mcpTool.name}`
  return {
    name: prefixedName,                    // 带前缀避免命名冲突
    description: mcpTool.description ?? '',
    input_schema: {
      type: 'object',
      ...mcpTool.inputSchema,
    },
    isConcurrencySafe: () => false,        // MCP 工具默认不安全
    interruptBehavior: () => 'block',
    call: async (input) => {
      const result = await this.callTool(mcpTool.name, input)
      return result.content
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('\n')
    },
  }
}
```

## 实现要点

### Happy Path

mini-cc 的 Happy Path 只覆盖 MCP tools。它的价值是把“远程发现 → 本地注册 → 调用转发”这个骨架跑通：

```
Agent Loop                  McpClient                         MCP Server
    │                           │                                  │
    │      connect(url)         │  POST /mcp (initialize)          │
    │──────────────────────────▶│─────────────────────────────────▶│
    │                           │  { serverInfo, capabilities }   │
    │                           │◀─────────────────────────────────│
    │                           │                                  │
    │      listTools()          │  POST /mcp (tools/list)          │
    │──────────────────────────▶│─────────────────────────────────▶│
    │                           │  { tools: [...] }                │
    │                           │◀─────────────────────────────────│
    │      return tools ◀───────│                                  │
    │                           │                                  │
    │      callTool(name, args) │  POST /mcp (tools/call)          │
    │──────────────────────────▶│─────────────────────────────────▶│
    │                           │  { content: [...] }              │
    │                           │◀─────────────────────────────────│
    │      return result ◀──────│                                  │
```

1. **connect(url)** — 通过 HTTP POST 发送 `initialize` 握手
2. **listTools()** — POST `tools/list` 请求，发现服务器提供的工具
3. **callTool(name, args)** — POST `tools/call` 请求，执行具体工具

对照 Claude Code 时，要把这个图再展开一层：

```
启动 / refresh
  │
  ├─ 读取 MCP 配置：user / project / plugin / dynamic
  │
  ├─ 连接 server：connected / failed / disabled / needs-auth
  │
  ├─ 按 capability 拉取远程能力
  │    ├─ tools        → Tool[]
  │    ├─ prompts      → Command[]
  │    ├─ resources    → ServerResource[]
  │    └─ instructions → mcp_instructions_delta
  │
  ├─ 写入 AppState.mcp
  │    ├─ clients
  │    ├─ tools
  │    ├─ commands
  │    └─ resources
  │
  └─ 每轮 query 构造上下文
       ├─ tools = builtInTools + allowed MCP tools
       ├─ commands = local commands + MCP commands
       ├─ attachments = MCP resources / MCP instructions delta
       └─ Agent Loop 只看到统一后的 Tool / Command / Attachment
```

这也是 Claude Code 的一个重要设计：Agent Loop 不需要知道工具来自 MCP，但 runtime 必须知道来源。因为权限、展示、缓存、资源读取、OAuth、server refresh 都依赖 `mcpInfo` 和 `AppState.mcp`。

在 mini-cc 的 HTTP happy path 里，无需子进程管理、行缓冲区、pending Map 和断开清理；Claude Code 需要同时支持 stdio / HTTP / SSE / SDK，所以连接生命周期会重很多。

### 边界情况

| 边界 | 处理方式 |
|------|----------|
| 服务器返回 HTTP 错误 | `response.ok` 检查，抛包含状态码的错误 |
| JSON-RPC 返回错误 | `json.error` 检查 |
| 服务器不支持 initialize | try-catch 静默跳过（部分 HTTP MCP 不需要握手） |
| 服务端网络不可达 | `fetch()` 抛网络异常，外层 try-catch 捕获 |
| initialize 成功后发送 initialized | fire-and-forget，不等待响应 |

## 与 claude-code 源码对照

| mini-cc 实现 | claude-code 参考 | 差异说明 |
|---|---|---|
| `src/services/mcp/client.ts` | `packages/mcp-client/src/`（8 文件） | mini-cc 只做 HTTP transport（~85 行）；claude-code 有 stdio/SSE/HTTP 多层 transport 适配 + Manager/Discovery/Cache 抽象层 |
| `src/services/mcp/types.ts` | `packages/mcp-client/src/types.ts` | mini-cc 只有 `{ url, headers }`，去掉了所有 transport 配置、OAuth、连接状态类型 |
| `src/services/mcp/errors.ts` | `packages/mcp-client/src/errors.ts` | 精简为 3 个错误类 |
| `tools.ts` → `registerMcpTools()` | `manager.ts` → `connect()` + `refreshTools()` | mini-cc 在 CLI 启动时一次性注册；claude-code 有完整事件系统 |
| 无 | `transport/InProcessTransport.ts` | 同进程 MCP server，mini-cc 不需要 |
| 无 | `discovery.ts` + `cache.ts` + `sanitization.ts` | mini-cc 不需要缓存/清洗层 |

关键简化：claude-code 的 MCP client 是**多服务器管理器**（重连、事件通知、权限集成），mini-cc 是**纯 HTTP 客户端**，专注于 JSON-RPC 的 happy path。

## 学到的设计教训

1. **HTTP > stdio 当协议本身是请求-响应时** — JSON-RPC 天然就是 request/response 模式，HTTP 的 `fetch()` 直接映射到这个模式。stdio 需要额外实现行分割、id 匹配、进程管理——这些复杂度 HTTP 已经帮你解决了。

2. **协议层要薄** — JSON-RPC 2.0 over HTTP 的核心就是 `fetch(POST url, JSON body)` + `response.json()`。不需要 SDK，不需要抽象层。

3. **前缀命名防冲突** — `mcp__server__tool` 解决了根本问题：多个 MCP 服务器可能暴露同名工具。前缀把命名空间映射到服务器名。

4. **适配器模式连接两个系统** — MCP 的 Tool 定义和 mini-cc 的 Tool 接口不同，不需要改任何一方的代码，一个 `toMiniCCTool()` 适配器就能对接。

---

*本教程由 mini-cc 项目在完成第 3 课后自动生成。*

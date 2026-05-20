# 第 6E 课：ToolSearch / Deferred MCP Tools

## 本质

MCP 的 Happy Path 是“远程工具发现后注册为 Tool”。但 Claude Code 更进一步：**工具可以已经注册在 runtime，却暂时不把完整 schema 发给模型**。

这解决的是 MCP 工具爆炸问题。一个 MCP server 可能暴露几十个工具，每个工具都有 description 和 input schema。如果全部放进首轮 `tools[]`，上下文会变大，prompt cache 也更容易被 MCP 连接状态扰动。

因此 Claude Code 把 MCP tools 默认视为 deferred tools：

```text
runtime 内部：所有 MCP tools 都存在，可以执行
模型首轮：只看到 deferred tool 名字 + ToolSearch
需要时：ToolSearch 选中某个工具，schema 在消息位置展开
```

## mini-cc 实现

本课没有实现 Anthropic 的 `tool_reference` beta，而是实现一个教学版：

1. MCP tool 注册时标记 `isMcp`，并读取 `_meta["anthropic/alwaysLoad"]` 和 `_meta["anthropic/searchHint"]`。
2. `ToolSearch` 搜索 deferred MCP tools，支持关键词和 `select:<tool_name>`。
3. `ToolSearch` 命中后生成 `deferred_tool_schema_delta`，把完整 schema 追加到 message 历史。
4. `streamMessage()` 发请求前过滤工具：只发送非 deferred 工具和 ToolSearch；已发现的 MCP tools 也不回填到头部 `tools[]`。
5. `deferred_tools_delta` attachment 只告诉模型有哪些 deferred tool 名字可搜。

这保留了 Claude Code 的核心边界：**懒加载的是 LLM 看到的 tool schema，不是 runtime 里的工具对象**。但它还不是 Claude Code 的完整协议版；完整实现会用 `tool_reference` / `defer_loading` 让 API 服务端把 schema 作为真正可调用的 message-local tool definition 展开。

## 流程图

### 1. 启动时：先全部注册到 runtime

MCP server 连接成功后，`tools/list` 返回的所有工具都会先进入本地工具池。这里的“注册”只是让 harness 知道它们存在、知道如何执行，不等于已经把完整 schema 注入给模型。

```text
MCP server
  │
  ├─ tools/list
  │
  ▼
McpClient.toMiniCCTool()
  │
  ├─ mcp__github__list_issues   isMcp=true
  ├─ mcp__github__create_issue  isMcp=true
  ├─ mcp__slack__send_message   isMcp=true
  └─ mcp__core__ping            isMcp=true, alwaysLoad=true
  │
  ▼
ToolRegistry / runtime.tools
  │
  ├─ 内置工具：read_file / edit_file / bash / ...
  ├─ Skill / AgentTool
  ├─ 所有 MCP tools
  └─ ToolSearch
```

所以答案是：**是的，所有 MCP tools 都注册在 runtime 的工具池里；只是其中大多数暂时不进入 API 请求的 `tools[]`。**

### 2. 首轮请求：只注入可见工具 schema

发给模型前，mini-cc 会从完整工具池里计算 `visibleTools`：

```text
runtime.tools
  │
  ▼
getVisibleToolsForRequest()
  │
  ├─ 非 deferred 工具       → 注入完整 schema
  ├─ ToolSearch             → 注入完整 schema
  ├─ alwaysLoad MCP tool    → 注入完整 schema
  └─ deferred MCP tool      → 不注入头部 schema
```

首轮模型实际看到的是两部分：

```text
API tools[]:
  read_file
  edit_file
  bash
  Skill
  AgentTool
  ToolSearch
  mcp__core__ping              # alwaysLoad 才会出现

messages 顶部的 attachment:
  <system-reminder>
  The following deferred tools are available via ToolSearch:
  mcp__github__list_issues
  mcp__github__create_issue
  mcp__slack__send_message
  </system-reminder>
```

这里的 `deferred_tools_delta` 是轻量目录，只放名字，不放 description 和 input schema。

### 3. 发现时：模型调用 ToolSearch

当模型需要 GitHub issue 能力，它不能直接调用 `mcp__github__list_issues`，因为这个工具还没有被注入进当前请求的 `tools[]`。它应该先调用：

```text
ToolSearch({ "query": "github issue" })
```

或者精确选择：

```text
ToolSearch({ "query": "select:mcp__github__list_issues" })
```

mini-cc 的 ToolSearch 做两件事：

```text
ToolSearch.call()
  │
  ├─ 在 runtime.tools 里搜索 deferred MCP tools
  └─ 命中后生成 deferred_tool_schema_delta
```

### 4. ToolSearch 后：Claude Code 不把 schema 普通追加到头部

这是最容易误解的一步。直觉上会以为：

```text
ToolSearch 找到 mcp__github__list_issues
  ↓
下一轮直接把 mcp__github__list_issues 的完整 schema 加进 tools[]
```

这正是会破坏缓存的做法，因为 `tools[]` 在 prompt 里位置很靠前，新增一个 schema 会影响后续请求的前缀稳定性。

Claude Code 的生产实现更细：

```text
ToolSearch tool_result:
  content:
    - type: tool_reference
      tool_name: mcp__github__list_issues

下一轮 API tools[]:
  仍会带这个 tool 的 schema 对象
  但 schema 标记 defer_loading: true

服务端渲染：
  defer_loading tool 不进入头部 <functions> 工具块
  tool_reference 在 message 位置展开成可调用的函数定义
```

也就是说，Claude Code 不是把发现后的工具当作普通头部工具注入，而是把它作为 **message 历史里的局部工具引用**。这样 schema 出现的位置跟 ToolSearch 的 tool_result 绑定，稳定 system prompt 和大部分头部 tools 块不会因为发现新 MCP tool 而整体抖动。

源码里的关键线索：

```text
ToolSearchTool.mapToolResultToToolResultBlockParam()
  → 返回 tool_reference block

claude.ts
  → 只包含已被 tool_reference 发现的 deferred tools
  → 但给它们加 defer_loading: true

utils/api.ts
  → defer_loading 是 per-request overlay
  → API 会把 defer_loading tools 从头部 prompt 工具块剥离
```

### 5. mini-cc 当前教学版的取舍

mini-cc 当前没有实现 Anthropic 的 `tool_reference` beta，所以只能退一步：

```text
ToolSearch 命中
  ↓
追加 deferred_tool_schema_delta 到 message 历史
  ↓
下一轮头部 tools[] 仍保持稳定
```

这能讲清楚“runtime 注册”和“LLM schema 可见性”是两回事，也避免了把发现后的 schema 放回头部 tools block。但它仍不等同于生产级 Claude Code：没有真实 `tool_reference` 时，普通 LLM API 不一定会把文本里的 `<functions>` 当成原生可调用工具。真正继续对齐时，需要把 6E 再拆成两层：

```text
6E-1：Deferred tool registry / ToolSearch delta    当前已实现
6E-2：tool_reference / defer_loading 消息级 schema  待实现
```

因此 mini-cc 里 **不是把发现到的 schema 放进下一轮头部 `tools[]`**。当前轮 API 请求已经发出去了，模型调用 ToolSearch 发生在响应过程中；教学版把 schema delta 追加到历史消息，生产级做法则是放 `tool_result` 的 `tool_reference` 内容块。


## 和 6D 的关系

6D 处理的是 Skill / Agent 列表：列表不该塞进 Tool description。  
6E 处理的是 MCP tool schema：大批动态 schema 不该一次性塞进 `tools[]`。

二者都是同一条原则：

> 动态能力先以轻量 discovery 进入上下文，需要时再展开完整定义。

## 源码对照

- `packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts`：`isDeferredTool()` 中 MCP tools 默认 deferred，`alwaysLoad` 可跳过。
- `src/services/api/claude.ts`：请求前只发送非 deferred 和 ToolSearch，deferred MCP tools 不回填到头部 tools block。
- `src/utils/toolSearch.ts`：`deferred_tools_delta` 只公告工具名，避免完整 schema 进入首轮上下文。

mini-cc 的实现更小：没有 `tool_reference`，而是由 `ToolSearch` 的副作用生成 `deferred_tool_schema_delta`，再作为 message 层提示词追加到历史里。

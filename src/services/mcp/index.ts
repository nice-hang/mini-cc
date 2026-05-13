// MCP 协议模块：外部工具发现与调用
//
// mini-cc 通过 HTTP POST 调用远程 MCP 服务器。
// 每个 JSON-RPC 请求是一次独立的 HTTP 请求，无需保持持久连接。
//
// 使用方式：
//   const client = new McpClient()
//   await client.connect('my-server', { url: 'http://localhost:3100/mcp' })
//   const tools = await client.listTools()
//   tools.forEach(t => registry.register(client.toMiniCCTool(t, 'my-server')))

export { McpClient } from './client.js'
export type { McpToolDefinition, McpToolResult } from './client.js'
export type { McpServerConfig } from './types.js'
export { McpError, McpConnectionError, McpToolCallError } from './errors.js'

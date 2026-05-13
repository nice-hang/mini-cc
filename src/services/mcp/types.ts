// MCP 类型定义：HTTP 服务器配置
//
// mini-cc 通过 HTTP POST 调用远程 MCP 服务器
// 每个 JSON-RPC 请求是一次独立的 HTTP 请求，无需保持连接

export interface McpServerConfig {
  url: string           // MCP 服务器地址，如 http://localhost:3100/mcp
  headers?: Record<string, string>  // 自定义请求头（如认证）
}

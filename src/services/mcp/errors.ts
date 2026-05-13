// MCP 错误类型
// JSON-RPC 调用中可能出现的各种失败场景

export class McpError extends Error {
  constructor(
    message: string,
    public readonly serverName: string,
  ) {
    super(message)
    this.name = 'McpError'
  }
}

export class McpConnectionError extends McpError {
  constructor(serverName: string, message: string) {
    super(`Connection to "${serverName}" failed: ${message}`, serverName)
    this.name = 'McpConnectionError'
  }
}

export class McpToolCallError extends McpError {
  constructor(
    serverName: string,
    public readonly toolName: string,
    message: string,
  ) {
    super(
      `Tool "${toolName}" on "${serverName}" failed: ${message}`,
      serverName,
    )
    this.name = 'McpToolCallError'
  }
}
